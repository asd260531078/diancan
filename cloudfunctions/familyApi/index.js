const cloud = require('wx-server-sdk');
const {
  categoryForWrite,
  cleanString,
  dishForWrite,
  isCloudFileID,
  publicCategory,
  publicDish,
} = require('./schema');
const {
  mealSetForWrite,
  publicMealSet,
} = require('./meal-set-schema');
const {
  ORDER_STATUS_TEXT,
  VALID_ORDER_STATUSES,
  assertDishOrderable: assertOrderDishAvailable,
  assertOrderOwner,
  buildOrderDocumentId,
  buildOrderItem,
  buildOrderTotals,
  generateOrderNo,
  mergeEquivalentOrderItems,
  normalizeCreateOrderInput,
  normalizePageLimit,
  normalizePageOffset,
  validateStatusTransition,
} = require('./order-schema');
const {
  compareAndSetOrderStatus,
  createOrderOnce,
  findExistingOrderAfterConflict,
} = require('./order-store');
const { prepareMenuSeedPlan } = require('./menu-seed-import');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const DEFAULT_CATEGORIES = [
  { name: '主食', type: 'food', sort: 10 },
  { name: '主菜', type: 'food', sort: 20 },
  { name: '汤', type: 'food', sort: 30 },
  { name: '饮品', type: 'drink', sort: 40 },
];

function success(data = {}) {
  return { success: true, data };
}

function appError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.isAppError = true;
  return error;
}

function safeDocumentId(prefix, preferredId) {
  const cleaned = String(preferredId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (cleaned) return cleaned;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// 同一个云函数实例内短暂缓存管理员判断，避免每次请求都查 2~4 次集合。
// 写操作仍会重新校验（缓存只有 30 秒，且仅缓存“是/否”）。
const ADMIN_CACHE_TTL_MS = 30 * 1000;
const adminCache = new Map();

async function findAdmin(openid) {
  const cached = adminCache.get(openid);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) return cached.admin;
  const admin = await lookupAdmin(openid);
  adminCache.set(openid, { admin, at: Date.now() });
  return admin;
}

async function lookupAdmin(openid) {
  const collections = ['admins', 'admin'];
  for (const collectionName of collections) {
    try {
      const byId = await db.collection(collectionName).doc(openid).get();
      if (byId.data && byId.data.enabled !== false) return byId.data;
    } catch (error) {
      // Continue with the explicit openid query for legacy admin documents.
    }

    try {
      const result = await db.collection(collectionName)
        .where({ openid })
        .limit(1)
        .get();
      if (result.data[0] && result.data[0].enabled !== false) return result.data[0];
    } catch (error) {
      // A missing legacy collection is allowed during initial setup.
    }
  }
  return null;
}

async function assertAdmin(openid) {
  const admin = await findAdmin(openid);
  if (!admin) throw appError('FORBIDDEN', '当前账号不是管理员，无权执行此操作');
  return admin;
}

async function fetchAll(collectionName, projection) {
  // 服务端 SDK 单次最多 1000 条；菜多时比 100 条一页少 9 成往返。
  const pageSize = 1000;
  const items = [];
  let offset = 0;
  while (true) {
    let query = db.collection(collectionName);
    if (projection) query = query.field(projection);
    const result = await query.skip(offset).limit(pageSize).get();
    items.push(...result.data);
    if (result.data.length < pageSize) break;
    offset += pageSize;
  }
  return items;
}

function dateSortValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value === 'object' && Number.isFinite(value.seconds)) return value.seconds * 1000;
  if (typeof value === 'object' && Number.isFinite(value._seconds)) return value._seconds * 1000;
  return 0;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function assertCategoryAcceptsDish(category, dishType) {
  const categoryType = category.type || category.itemType || 'all';
  if (categoryType !== 'all' && categoryType !== dishType) {
    throw appError('CATEGORY_TYPE_MISMATCH', '菜品类型与所选分类类型不一致');
  }
}

function dishReferencesCategory(dish, category) {
  if (dish.categoryId === category.id) return true;
  if (dish.categoryId) return false;
  const legacyCategoryName = cleanString(dish.categoryName || dish.category, 50);
  return Boolean(legacyCategoryName && legacyCategoryName === category.name);
}

async function findCategoryReferences(category) {
  const dishes = await fetchAll('dishes');
  return dishes.filter(dish => dishReferencesCategory(dish, category));
}

async function assertUniqueCategoryName(name, excludedCategoryId = '') {
  const duplicate = await db.collection('categories').where({ name }).get();
  const conflict = duplicate.data.find(item => (item._id || item.id) !== excludedCategoryId);
  if (conflict) throw appError('DUPLICATE_CATEGORY', '分类名称已存在');
}

function sanitizeImageReferencesForWrite(raw = {}) {
  const sourceCover = raw.cover || raw.image || '';
  const cover = isCloudFileID(sourceCover) ? sourceCover : '';
  const images = Array.isArray(raw.images) ? raw.images.filter(isCloudFileID) : [];
  const steps = Array.isArray(raw.steps) ? raw.steps.map(step => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
    return { ...step, image: isCloudFileID(step.image) ? step.image : '' };
  }) : raw.steps;
  return { ...raw, cover, image: cover, images, steps };
}

async function touchUser(openid) {
  const now = db.serverDate();
  try {
    const result = await db.collection('users').doc(openid).update({ data: { lastSeenAt: now, updatedAt: now } });
    if (!result.stats || result.stats.updated === 0) {
      throw new Error('user not found');
    }
  } catch (error) {
    await db.collection('users').doc(openid).set({
      data: {
        openid,
        role: 'user',
        enabled: true,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      },
    });
  }
}

async function getSession(openid) {
  // 用户记录写入和管理员查询并行，启动时少等一次数据库往返。
  const [, admin] = await Promise.all([
    touchUser(openid).catch(error => console.warn('更新用户访问时间失败', error && error.message)),
    findAdmin(openid),
  ]);
  return success({ openid, isAdmin: Boolean(admin), role: admin ? (admin.role || 'admin') : 'user' });
}

// ---- 菜单目录：摘要列表 + 版本号 ----
// 列表只返回卡片、规格弹层、随机搭配需要的字段；做法/食材/图集只在详情接口返回。
const DISH_DETAIL_FIELDS = ['ingredients', 'steps', 'legacyIngredients', 'legacySteps', 'tips', 'images',
  'ingredientsText', 'stepsText'];
const DISH_SUMMARY_PROJECTION = DISH_DETAIL_FIELDS.reduce((result, key) => ({ ...result, [key]: false }), {});
const CATALOG_META_COLLECTION = 'meta';
const CATALOG_META_ID = 'catalog';
const CATALOG_WRITE_ACTIONS = new Set([
  'createDish', 'updateDish', 'deleteDish', 'createCategory', 'updateCategory', 'deleteCategory',
  'reorderCategories', 'seedDefaultCategories', 'seedMenuCatalog', 'importLegacyDishes', 'migrateDishesV2',
]);
let catalogPayloadCache = null;

function summaryDish(dish) {
  const summary = { ...dish };
  DISH_DETAIL_FIELDS.forEach(key => { delete summary[key]; });
  delete summary._openid;
  return summary;
}

async function readCatalogVersion() {
  try {
    const result = await db.collection(CATALOG_META_COLLECTION).doc(CATALOG_META_ID).get();
    return (result.data && result.data.version) || '';
  } catch (error) {
    return '';
  }
}

async function bumpCatalogVersion() {
  const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const write = () => db.collection(CATALOG_META_COLLECTION).doc(CATALOG_META_ID)
    .set({ data: { version, updatedAt: db.serverDate() } });
  catalogPayloadCache = null;
  try {
    await write();
  } catch (error) {
    try {
      await db.createCollection(CATALOG_META_COLLECTION);
      await write();
    } catch (retryError) {
      // 版本号只是缓存提示；写失败时客户端会一直走完整拉取，不影响正确性。
      console.warn('更新菜单版本号失败', retryError && retryError.message);
    }
  }
  return version;
}

async function buildPublicCatalog() {
  const [rawDishes, rawCategories] = await Promise.all([
    fetchAll('dishes', DISH_SUMMARY_PROJECTION),
    fetchAll('categories'),
  ]);
  const categories = rawCategories.map(publicCategory);
  const categoryById = {};
  const categoryByName = {};
  categories.forEach(category => {
    categoryById[category.id] = category;
    categoryByName[category.name] = category;
  });
  const dishes = rawDishes.map(publicDish).map(dish => ({
    dish, category: categoryById[dish.categoryId] || categoryByName[dish.categoryName] || null,
  }))
    .filter(item => item.dish.enabled && (!item.category || item.category.enabled))
    .sort(compareDishEntries)
    .map(item => summaryDish(item.dish));
  return {
    dishes,
    categories: categories.filter(item => item.enabled).sort(compareCategories),
  };
}

async function getCatalog(event) {
  const version = await readCatalogVersion();
  const knownVersion = cleanString(event.knownVersion, 100);
  if (version && knownVersion && knownVersion === version) {
    return success({ version, notModified: true });
  }
  if (version && catalogPayloadCache && catalogPayloadCache.version === version) {
    return success({ version, ...catalogPayloadCache.payload });
  }
  const payload = await buildPublicCatalog();
  // 构建期间如果有人改了菜单，不缓存这份可能过期的数据。
  if (version && version === await readCatalogVersion()) catalogPayloadCache = { version, payload };
  return success({ version, ...payload });
}

async function getDishDetail(event, openid) {
  const dishId = cleanString(event.dishId, 100);
  if (!dishId) throw appError('INVALID_DISH', '缺少菜品 ID');
  let raw = null;
  try {
    raw = (await db.collection('dishes').doc(dishId).get()).data || null;
  } catch (error) {
    raw = null;
  }
  if (!raw) return success({ item: null });
  const dish = publicDish(raw);
  let category = null;
  if (dish.categoryId) {
    try {
      category = publicCategory((await db.collection('categories').doc(dish.categoryId).get()).data);
    } catch (error) {
      category = null;
    }
  }
  const visible = dish.enabled && (!category || category.enabled);
  if (!visible) {
    if (!event.includeDisabled) return success({ item: null });
    await assertAdmin(openid);
  }
  delete dish._openid;
  return success({ item: dish });
}

async function listDishes(event, openid) {
  const includeDisabled = Boolean(event.includeDisabled);
  if (includeDisabled) await assertAdmin(openid);
  // summary=true 时不读取做法/食材等大字段；旧版客户端不传该参数，仍拿到完整数据。
  const summaryOnly = event.summary === true;
  const [rawDishes, rawCategories] = await Promise.all([
    fetchAll('dishes', summaryOnly ? DISH_SUMMARY_PROJECTION : undefined),
    fetchAll('categories'),
  ]);
  const categories = rawCategories.map(publicCategory);
  const categoryById = {};
  const categoryByName = {};
  categories.forEach(category => {
    categoryById[category.id] = category;
    categoryByName[category.name] = category;
  });
  let items = rawDishes.map(publicDish).map(dish => {
    const category = categoryById[dish.categoryId] || categoryByName[dish.categoryName] || null;
    return { dish, category };
  });
  if (!includeDisabled) {
    items = items.filter(item => item.dish.enabled && (!item.category || item.category.enabled));
  }
  items = items.sort(compareDishEntries).map(item => (summaryOnly ? summaryDish(item.dish) : item.dish));
  return success({ items });
}

function compareDishEntries(left, right) {
  const categorySortA = left.category ? left.category.sort : 999999;
  const categorySortB = right.category ? right.category.sort : 999999;
  return (categorySortA - categorySortB)
    || (left.dish.sort - right.dish.sort)
    || (dateSortValue(left.dish.createdAt) - dateSortValue(right.dish.createdAt))
    || String(left.dish.id || left.dish.name).localeCompare(String(right.dish.id || right.dish.name), 'zh-CN');
}

function compareCategories(a, b) {
  return (a.sort - b.sort)
    || (dateSortValue(a.createdAt) - dateSortValue(b.createdAt))
    || String(a.name).localeCompare(String(b.name), 'zh-CN');
}

async function listCategories(event, openid) {
  const includeDisabled = Boolean(event.includeDisabled);
  if (includeDisabled) await assertAdmin(openid);
  let items = (await fetchAll('categories')).map(publicCategory);
  if (!includeDisabled) items = items.filter(item => item.enabled);
  items = items.sort(compareCategories);
  return success({ items });
}

async function getCategory(categoryId) {
  if (!categoryId) throw appError('INVALID_CATEGORY', '请选择分类');
  try {
    const result = await db.collection('categories').doc(categoryId).get();
    if (!result.data) throw new Error('not found');
    return publicCategory(result.data);
  } catch (error) {
    throw appError('INVALID_CATEGORY', '所选分类不存在');
  }
}

async function ensureCategoryByName(name, itemType, sort = 0, options = {}) {
  const safeName = cleanString(name || (itemType === 'drink' ? '饮品' : '未分类'), 50);
  const existing = await db.collection('categories').where({ name: safeName }).limit(1).get();
  if (existing.data[0]) {
    const raw = existing.data[0];
    if (options.backfillMissing === true) {
      const patch = {};
      if (!hasOwn(raw, 'type') || !raw.type) {
        patch.type = ['food', 'drink', 'all'].includes(raw.itemType) ? raw.itemType : itemType;
      }
      if (!hasOwn(raw, 'icon')) patch.icon = '';
      if (!hasOwn(raw, 'enabled')) patch.enabled = true;
      if (!hasOwn(raw, 'sort')) patch.sort = sort;
      if (Object.keys(patch).length) {
        patch.updatedAt = db.serverDate();
        if (options.updatedBy) patch.updatedBy = options.updatedBy;
        await db.collection('categories').doc(raw._id || raw.id).update({ data: patch });
        return publicCategory({ ...raw, ...patch });
      }
    }
    return publicCategory(raw);
  }

  const id = safeDocumentId('cat');
  const now = db.serverDate();
  const category = categoryForWrite({ name: safeName, type: itemType, sort, enabled: true });
  await db.collection('categories').doc(id).set({
    data: { id, ...category, createdAt: now, updatedAt: now },
  });
  return { id, ...category };
}

async function createDish(event, openid) {
  await assertAdmin(openid);
  const input = event.dish || {};
  const category = await getCategory(input.categoryId);
  const dish = dishForWrite(input, category);
  assertCategoryAcceptsDish(category, dish.type);
  const id = safeDocumentId('dish', input.id);
  const now = db.serverDate();
  await db.collection('dishes').doc(id).set({
    data: { id, ...dish, schemaVersion: 2, createdAt: now, updatedAt: now, createdBy: openid, updatedBy: openid },
  });
  return success({ id });
}

async function updateDish(event, openid) {
  await assertAdmin(openid);
  const dishId = cleanString(event.dishId, 100);
  if (!dishId) throw appError('INVALID_DISH', '缺少菜品 ID');

  let current;
  try {
    current = (await db.collection('dishes').doc(dishId).get()).data;
  } catch (error) {
    throw appError('NOT_FOUND', '菜品不存在');
  }
  const patch = event.patch || {};
  const touchesCover = Object.prototype.hasOwnProperty.call(patch, 'cover')
    || Object.prototype.hasOwnProperty.call(patch, 'image');
  const touchesImages = Object.prototype.hasOwnProperty.call(patch, 'images');
  const touchesIngredients = Object.prototype.hasOwnProperty.call(patch, 'ingredients');
  const touchesSteps = Object.prototype.hasOwnProperty.call(patch, 'steps');
  const merged = { ...publicDish(current), ...patch };
  // 状态快捷操作不携带图片字段时，保留旧文档原值，不把读取层的占位图重新写入数据库。
  // 完整编辑页会明确提交这些字段，并由 schema 强制要求 cloud:// fileID。
  if (!touchesCover) {
    merged.cover = '';
    merged.image = '';
  }
  if (!touchesImages) merged.images = [];
  if (!touchesSteps) merged.steps = [];
  const category = await getCategory(merged.categoryId);
  const dish = dishForWrite(merged, category);
  assertCategoryAcceptsDish(category, dish.type);

  const updateData = { ...dish, schemaVersion: 2, updatedAt: db.serverDate(), updatedBy: openid };
  if (!touchesCover) {
    delete updateData.cover;
    delete updateData.image;
  }
  if (!touchesImages) delete updateData.images;
  if (!touchesIngredients) {
    delete updateData.ingredients;
    delete updateData.legacyIngredients;
  }
  if (!touchesSteps) {
    delete updateData.steps;
    delete updateData.legacySteps;
  }

  await db.collection('dishes').doc(dishId).update({
    data: updateData,
  });
  return success({ id: dishId });
}

async function deleteDish(event, openid) {
  await assertAdmin(openid);
  const dishId = cleanString(event.dishId, 100);
  if (!dishId) throw appError('INVALID_DISH', '缺少菜品 ID');
  await db.collection('dishes').doc(dishId).remove();
  return success({ id: dishId });
}

async function createCategory(event, openid) {
  await assertAdmin(openid);
  const category = categoryForWrite(event.category || {});
  await assertUniqueCategoryName(category.name);
  const id = safeDocumentId('cat', event.category && event.category.id);
  const now = db.serverDate();
  await db.collection('categories').doc(id).set({
    data: { id, ...category, createdAt: now, updatedAt: now, createdBy: openid, updatedBy: openid },
  });
  return success({ id });
}

async function updateCategory(event, openid) {
  await assertAdmin(openid);
  const categoryId = cleanString(event.categoryId, 100);
  if (!categoryId) throw appError('INVALID_CATEGORY', '缺少分类 ID');
  let current;
  try {
    current = (await db.collection('categories').doc(categoryId).get()).data;
  } catch (error) {
    throw appError('NOT_FOUND', '分类不存在');
  }
  const currentCategory = publicCategory(current);
  const category = categoryForWrite({ ...current, ...(event.patch || {}) });
  await assertUniqueCategoryName(category.name, categoryId);
  const relatedDishes = await findCategoryReferences(currentCategory);
  if (category.type !== currentCategory.type && category.type !== 'all') {
    const incompatible = relatedDishes
      .map(publicDish)
      .filter(dish => dish.type !== category.type);
    if (incompatible.length) {
      const incompatibleType = category.type === 'drink' ? 'food' : 'drink';
      throw appError(
        'CATEGORY_TYPE_IN_USE',
        `当前分类已有 ${incompatible.length} 个 ${incompatibleType} 菜品/饮品，不能直接改为 ${category.type}`,
      );
    }
  }
  await db.collection('categories').doc(categoryId).update({
    data: { ...category, updatedAt: db.serverDate(), updatedBy: openid },
  });

  // categoryName/category 是为旧页面保留的展示冗余字段，仅在分类改名时同步。
  // 启停、排序和类型设置不会改写 dishes.categoryId 或其他菜品数据。
  if (category.name !== currentCategory.name) {
    await Promise.all(relatedDishes.map(dish => db.collection('dishes').doc(dish._id).update({
      data: {
        categoryName: category.name,
        category: category.name,
        updatedAt: db.serverDate(),
        updatedBy: openid,
      },
    })));
  }
  return success({ id: categoryId });
}

async function deleteCategory(event, openid) {
  await assertAdmin(openid);
  const categoryId = cleanString(event.categoryId, 100);
  if (!categoryId) throw appError('INVALID_CATEGORY', '缺少分类 ID');
  let current;
  try {
    current = (await db.collection('categories').doc(categoryId).get()).data;
  } catch (error) {
    throw appError('NOT_FOUND', '分类不存在');
  }
  const referenced = await findCategoryReferences(publicCategory(current));
  if (referenced.length) {
    throw appError(
      'CATEGORY_IN_USE',
      `当前分类还有 ${referenced.length} 个菜品/饮品，请先移动或处理这些内容后再删除分类。`,
    );
  }
  await db.collection('categories').doc(categoryId).remove();
  return success({ id: categoryId });
}

async function reorderCategories(event, openid) {
  await assertAdmin(openid);
  const categoryIds = Array.isArray(event.categoryIds)
    ? event.categoryIds.map(id => cleanString(id, 100)).filter(Boolean)
    : [];
  if (!categoryIds.length || new Set(categoryIds).size !== categoryIds.length) {
    throw appError('INVALID_CATEGORY_ORDER', '分类排序数据无效');
  }
  const categories = await fetchAll('categories');
  const existingIds = categories.map(item => item._id || item.id).filter(Boolean);
  const exactSet = categoryIds.length === existingIds.length
    && categoryIds.every(id => existingIds.includes(id));
  if (!exactSet) throw appError('CATEGORY_ORDER_STALE', '分类数据已变化，请刷新后重试');

  await Promise.all(categoryIds.map((categoryId, index) => db.collection('categories').doc(categoryId).update({
    data: {
      sort: (index + 1) * 10,
      updatedAt: db.serverDate(),
      updatedBy: openid,
    },
  })));
  return success({ ids: categoryIds });
}

async function seedDefaultCategories(event, openid) {
  await assertAdmin(openid);
  const ids = [];
  for (const item of DEFAULT_CATEGORIES) {
    const category = await ensureCategoryByName(item.name, item.type, item.sort, {
      backfillMissing: true,
      updatedBy: openid,
    });
    ids.push(category.id);
  }
  return success({ ids });
}

async function runSeedOperations(operations, handler, result, field) {
  const batchSize = 8;
  for (let offset = 0; offset < operations.length; offset += batchSize) {
    const batch = operations.slice(offset, offset + batchSize);
    await Promise.all(batch.map(async operation => {
      try {
        await handler(operation);
        result.applied[field] += 1;
      } catch (error) {
        result.failures.push({ id: operation.id, name: operation.name || '', message: error.message });
      }
    }));
  }
}

async function seedMenuCatalog(event, openid) {
  await assertAdmin(openid);
  const seed = event.seed || 'v1';
  if (!['v1', 'v2-additions', 'v3-additions'].includes(seed)) {
    throw appError('INVALID_SEED', '未知菜单导入批次');
  }
  const dryRun = event.dryRun !== false;
  const requestedMaxWrites = Number(event.maxWrites);
  const maxWrites = Number.isInteger(requestedMaxWrites) && requestedMaxWrites >= 1
    ? Math.min(requestedMaxWrites, 30)
    : 20;
  const [categories, dishes] = await Promise.all([fetchAll('categories'), fetchAll('dishes')]);
  const plan = prepareMenuSeedPlan(categories, dishes, { seed });
  const result = {
    ...plan.summary,
    seed,
    dryRun,
    maxWrites,
    blocked: plan.summary.conflicts.length > 0,
    applied: { categoriesCreated: 0, categoriesBackfilled: 0, dishesCreated: 0, recipesBackfilled: 0 },
    failures: [],
  };
  if (dryRun || result.blocked) return success(result);

  const failedCategoryIds = new Set();
  let remainingWrites = maxWrites;
  const categoryCreates = plan.categoriesToCreate.slice(0, remainingWrites);
  remainingWrites -= categoryCreates.length;
  await runSeedOperations(categoryCreates, async category => {
    try {
      await createCategory({ category }, openid);
    } catch (error) {
      failedCategoryIds.add(category.id);
      throw error;
    }
  }, result, 'categoriesCreated');
  const categoryBackfills = plan.categoriesToBackfill.slice(0, remainingWrites);
  remainingWrites -= categoryBackfills.length;
  await runSeedOperations(categoryBackfills, category => db.collection('categories').doc(category.id).update({
    data: { ...category.patch, updatedAt: db.serverDate(), updatedBy: openid },
  }), result, 'categoriesBackfilled');

  const existingCategoryIds = new Set(categories.map(item => item._id || item.id));
  const createdCategoryIds = new Set(categoryCreates.filter(item => !failedCategoryIds.has(item.id)).map(item => item.id));
  const readyDishes = plan.dishesToCreate.filter(dish => existingCategoryIds.has(dish.categoryId)
    || createdCategoryIds.has(dish.categoryId));
  for (const dish of plan.dishesToCreate) {
    if (failedCategoryIds.has(dish.categoryId)) {
      result.failures.push({ id: dish.id, name: dish.name, message: '分类创建失败，本次跳过商品' });
    }
  }
  const dishCreates = readyDishes.slice(0, remainingWrites);
  remainingWrites -= dishCreates.length;
  await runSeedOperations(dishCreates, dish => createDish({ dish }, openid), result, 'dishesCreated');
  const recipeBackfills = plan.recipesToBackfill.slice(0, remainingWrites);
  await runSeedOperations(recipeBackfills, item => db.collection('dishes').doc(item.id).update({
    data: { ...item.patch, updatedAt: db.serverDate(), updatedBy: openid },
  }), result, 'recipesBackfilled');
  result.remainingEstimate = plan.categoriesToCreate.length + plan.categoriesToBackfill.length
    + plan.dishesToCreate.length + plan.recipesToBackfill.length
    - Object.values(result.applied).reduce((sum, count) => sum + count, 0);
  result.needsAnotherRun = result.remainingEstimate > 0;
  return success(result);
}

async function importLegacyDishes(event, openid) {
  await assertAdmin(openid);
  const legacyDishes = Array.isArray(event.dishes) ? event.dishes.slice(0, 300) : [];
  const overwrite = Boolean(event.overwrite);
  const summary = { imported: 0, skipped: 0, failed: 0, errors: [] };

  for (const raw of legacyDishes) {
    try {
      const category = await ensureCategoryByName(raw.categoryName || raw.category, raw.type, raw.sort);
      const normalized = dishForWrite(sanitizeImageReferencesForWrite(raw), category, { legacy: true });
      assertCategoryAcceptsDish(category, normalized.type);
      const id = safeDocumentId('dish', raw.id || raw._id);
      let existing = null;
      try {
        existing = (await db.collection('dishes').doc(id).get()).data || null;
      } catch (error) {
        existing = null;
      }
      if (existing && !overwrite) {
        summary.skipped += 1;
        continue;
      }

      const now = db.serverDate();
      const data = {
        id,
        ...normalized,
        schemaVersion: 2,
        migrationSource: 'local-storage-v1',
        createdAt: existing && existing.createdAt || raw.createdAt || now,
        createdBy: existing && existing.createdBy || openid,
        updatedAt: now,
        updatedBy: openid,
      };
      await db.collection('dishes').doc(id).set({ data });
      summary.imported += 1;
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ id: raw && raw.id || '', name: raw && raw.name || '', message: error.message });
    }
  }
  return success(summary);
}

async function migrateDishesV2(event, openid) {
  await assertAdmin(openid);
  const dryRun = event.dryRun !== false;
  const [rawDishes, rawCategories] = await Promise.all([fetchAll('dishes'), fetchAll('categories')]);
  const categories = rawCategories.map(publicCategory);
  const categoryById = {};
  const categoryByName = {};
  categories.forEach(category => {
    categoryById[category.id] = category;
    categoryByName[category.name] = category;
  });
  const summary = {
    dryRun,
    total: rawDishes.length,
    wouldMigrate: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const raw of rawDishes) {
    try {
      if (Number(raw.schemaVersion) >= 2) {
        summary.skipped += 1;
        continue;
      }
      const normalizedRead = publicDish(raw);
      let category = categoryById[normalizedRead.categoryId] || categoryByName[normalizedRead.categoryName];
      if (!category) {
        if (dryRun) {
          category = {
            id: normalizedRead.categoryId || `legacy:${encodeURIComponent(normalizedRead.categoryName)}`,
            name: normalizedRead.categoryName || (normalizedRead.type === 'drink' ? '饮品' : '未分类'),
            type: normalizedRead.type,
            itemType: normalizedRead.type,
            enabled: true,
            sort: 9999,
          };
        } else {
          category = await ensureCategoryByName(
            normalizedRead.categoryName,
            normalizedRead.type,
            9999,
          );
          categoryById[category.id] = category;
          categoryByName[category.name] = category;
        }
      }
      const normalizedWrite = dishForWrite(sanitizeImageReferencesForWrite(normalizedRead), category);
      assertCategoryAcceptsDish(category, normalizedWrite.type);
      summary.wouldMigrate += 1;
      if (dryRun) continue;

      const documentId = raw._id || raw.id;
      if (!documentId) throw appError('INVALID_DISH', '旧菜品缺少文档 ID');
      const data = {
        ...normalizedWrite,
        schemaVersion: 2,
        migrationSource: raw.migrationSource || 'cloud-dishes-v1',
        updatedAt: db.serverDate(),
        updatedBy: openid,
      };
      if (!raw.createdAt) data.createdAt = db.serverDate();
      await db.collection('dishes').doc(documentId).update({ data });
      summary.migrated += 1;
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({
        id: raw && (raw._id || raw.id) || '',
        name: raw && raw.name || '',
        code: error.code || 'MIGRATION_ERROR',
        message: error.message,
      });
    }
  }
  return success(summary);
}

function publicOrder(raw = {}, options = {}) {
  const order = {
    id: raw.id || raw._id || '',
    orderNo: raw.orderNo || raw.id || raw._id || '',
    requestId: raw.requestId || '',
    items: Array.isArray(raw.items) ? raw.items : [],
    itemCount: Number(raw.itemCount) || 0,
    totalAmount: Number.isFinite(Number(raw.totalAmount)) ? Number(raw.totalAmount) : 0,
    hasUnpricedItems: raw.hasUnpricedItems === true,
    orderNote: cleanString(raw.orderNote, 200),
    status: VALID_ORDER_STATUSES.includes(raw.status) ? raw.status : 'pending',
    statusText: ORDER_STATUS_TEXT[raw.status] || '待确认',
    userSnapshot: raw.userSnapshot && typeof raw.userSnapshot === 'object' ? raw.userSnapshot : {},
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    confirmedAt: raw.confirmedAt || null,
    preparingAt: raw.preparingAt || null,
    completedAt: raw.completedAt || null,
    cancelledAt: raw.cancelledAt || null,
  };
  if (options.manage === true) order.userOpenId = raw.userOpenId || '';
  return order;
}

async function getOrderDocument(orderId) {
  if (typeof orderId !== 'string') throw appError('INVALID_ORDER', '订单 ID 无效');
  const safeOrderId = cleanString(orderId, 100);
  if (!safeOrderId) throw appError('INVALID_ORDER', '缺少订单 ID');
  try {
    const result = await db.collection('orders').doc(safeOrderId).get();
    if (!result.data) throw new Error('not found');
    return result.data;
  } catch (error) {
    throw appError('ORDER_NOT_FOUND', '订单不存在');
  }
}

async function getUserSnapshot(openid) {
  try {
    const user = (await db.collection('users').doc(openid).get()).data || {};
    return {
      nickname: cleanString(user.nickname || user.nickName || user.displayName, 50),
      avatarUrl: cleanString(user.avatarUrl, 1000),
    };
  } catch (error) {
    return { nickname: '', avatarUrl: '' };
  }
}

function categoryForOrder(dish, categoryById, categoryByName) {
  return categoryById[dish.categoryId]
    || categoryByName[dish.categoryName || dish.category]
    || null;
}

async function createOrder(event, openid) {
  const input = normalizeCreateOrderInput(event);
  const documentId = buildOrderDocumentId(openid, input.requestId);

  try {

    try {
      const existing = (await db.collection('orders').doc(documentId).get()).data;
      if (existing) return success({ order: publicOrder(existing), idempotent: true });
    } catch (error) {
      // Deterministic document ID means a missing document is the normal first-submit path.
    }

    const uniqueDishIds = [...new Set(input.items.map(item => item.dishId))];
    const dishPairs = await Promise.all(uniqueDishIds.map(async dishId => {
      try {
        const raw = (await db.collection('dishes').doc(dishId).get()).data;
        return [dishId, raw ? publicDish(raw) : null];
      } catch (error) {
        return [dishId, null];
      }
    }));
    const dishById = Object.fromEntries(dishPairs);
    const categories = (await fetchAll('categories')).map(publicCategory);
    const categoryById = {};
    const categoryByName = {};
    categories.forEach(category => {
      categoryById[category.id] = category;
      categoryByName[category.name] = category;
    });

    const rawItems = input.items.map(intentItem => {
      const dish = dishById[intentItem.dishId];
      if (!dish) throw appError('DISH_NOT_FOUND', '点菜单中有商品已不存在，请重新确认');
      const category = categoryForOrder(dish, categoryById, categoryByName);
      assertOrderDishAvailable(dish, category);
      return buildOrderItem(dish, intentItem);
    });
    const items = mergeEquivalentOrderItems(rawItems);
    const totals = buildOrderTotals(items);
    const nowValue = Date.now();
    const now = db.serverDate();
    const data = {
      id: documentId,
      orderNo: generateOrderNo(openid, input.requestId, nowValue),
      requestId: input.requestId,
      userOpenId: openid,
      userSnapshot: await getUserSnapshot(openid),
      items,
      ...totals,
      orderNote: input.orderNote,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      preparingAt: null,
      completedAt: null,
      cancelledAt: null,
      adminNotificationState: 'pending',
    };

    // 事务内执行“存在检查 + 创建”，确保并发重试只有一个请求真正创建订单。
    const creation = await createOrderOnce(db, documentId, data);
    const created = await getOrderDocument(documentId);
    return success({ order: publicOrder(created), idempotent: creation.created !== true });
  } catch (error) {
    if (error && error.isAppError === true) throw error;
    const existing = await findExistingOrderAfterConflict(db, documentId);
    if (existing) return success({ order: publicOrder(existing), idempotent: true });
    throw error;
  }
}

async function queryOrders(query, event, options = {}) {
  const limit = normalizePageLimit(event.limit);
  const offset = normalizePageOffset(event.offset);
  const result = await query
    .orderBy('createdAt', 'desc')
    .skip(offset)
    .limit(limit + 1)
    .get();
  const hasMore = result.data.length > limit;
  const items = result.data.slice(0, limit).map(item => publicOrder(item, options));
  return success({ items, hasMore, nextOffset: hasMore ? offset + items.length : null });
}

async function listMyOrders(event, openid) {
  return queryOrders(db.collection('orders').where({ userOpenId: openid }), event);
}

// 角标只需要“未完成订单”的数量和 ID；直接按状态查，不再翻遍全部历史订单。
const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'preparing'];
async function getMyOpenOrderSummary(event, openid) {
  const _ = db.command;
  const result = await db.collection('orders')
    .where({ userOpenId: openid, status: _.in(OPEN_ORDER_STATUSES) })
    .field({ _id: true, id: true, orderNo: true })
    .limit(100)
    .get();
  const orderIds = [...new Set(result.data.map(item => String(item.id || item._id || item.orderNo)).filter(Boolean))];
  return success({ count: orderIds.length, orderIds });
}

async function getMyOrderDetail(event, openid) {
  const order = await getOrderDocument(event.orderId);
  assertOrderOwner(order, openid, '无权查看此订单');
  return success({ order: publicOrder(order) });
}

async function cancelMyOrder(event, openid) {
  const order = await getOrderDocument(event.orderId);
  assertOrderOwner(order, openid, '无权取消此订单');
  if (order.status !== 'pending') {
    if (order.status === 'cancelled') throw appError('ORDER_CANNOT_CANCEL', '订单已经取消');
    if (order.status === 'completed') throw appError('ORDER_CANNOT_CANCEL', '订单已经完成，不能取消');
    throw appError('ORDER_CANNOT_CANCEL', '订单已经确认，如需取消请联系小高');
  }
  const now = db.serverDate();
  const updated = await compareAndSetOrderStatus(db, order._id || order.id, 'pending', {
    status: 'cancelled',
    cancelledAt: now,
    updatedAt: now,
  });
  if (!updated) {
    throw appError('ORDER_STATUS_CONFLICT', '订单状态已经变化，请刷新后重试');
  }
  return success({ order: publicOrder(await getOrderDocument(order._id || order.id)) });
}

async function listManageOrders(event, openid) {
  await assertAdmin(openid);
  const status = cleanString(event.status, 30);
  if (status && status !== 'all' && !VALID_ORDER_STATUSES.includes(status)) {
    throw appError('INVALID_ORDER_STATUS', '订单筛选状态无效');
  }
  const query = status && status !== 'all'
    ? db.collection('orders').where({ status })
    : db.collection('orders');
  return queryOrders(query, event, { manage: true });
}

async function getManageOrderDetail(event, openid) {
  await assertAdmin(openid);
  return success({ order: publicOrder(await getOrderDocument(event.orderId), { manage: true }) });
}

async function updateOrderStatus(event, openid) {
  await assertAdmin(openid);
  const order = await getOrderDocument(event.orderId);
  const nextStatus = cleanString(event.status, 30);
  validateStatusTransition(order.status, nextStatus);
  const now = db.serverDate();
  const patch = { status: nextStatus, updatedAt: now };
  if (nextStatus === 'confirmed') patch.confirmedAt = now;
  if (nextStatus === 'preparing') patch.preparingAt = now;
  if (nextStatus === 'completed') patch.completedAt = now;
  if (nextStatus === 'cancelled') patch.cancelledAt = now;
  const updated = await compareAndSetOrderStatus(db, order._id || order.id, order.status, patch);
  if (!updated) {
    throw appError('ORDER_STATUS_CONFLICT', '订单状态已经变化，请刷新后重试');
  }
  return success({ order: publicOrder(await getOrderDocument(order._id || order.id), { manage: true }) });
}

function sortMealSets(items) {
  return items.sort((left, right) => (Number(left.sort) - Number(right.sort))
    || (dateSortValue(left.createdAt) - dateSortValue(right.createdAt))
    || String(left.id || left.name).localeCompare(String(right.id || right.name), 'zh-CN'));
}

async function getMealSetDocument(mealSetId) {
  const id = cleanString(mealSetId, 100);
  if (!id) throw appError('INVALID_MEAL_SET', '缺少套餐 ID');
  try {
    const result = await db.collection('mealSets').doc(id).get();
    if (!result.data) throw new Error('not found');
    return result.data;
  } catch (error) {
    throw appError('NOT_FOUND', '套餐不存在');
  }
}

async function assertMealSetDishesExist(items) {
  const dishes = await fetchAll('dishes');
  const existingIds = new Set(dishes.map(item => item._id || item.id).filter(Boolean));
  const missing = items.find(item => !existingIds.has(item.dishId));
  if (missing) throw appError('MEAL_SET_DISH_NOT_FOUND', `套餐商品不存在：${missing.dishId}`);
}

async function buildMealSetBundle(mealSets) {
  const [rawDishes, rawCategories] = await Promise.all([fetchAll('dishes'), fetchAll('categories')]);
  const referencedDishIds = new Set();
  mealSets.forEach(mealSet => mealSet.items.forEach(item => referencedDishIds.add(item.dishId)));
  const dishes = rawDishes
    .filter(dish => referencedDishIds.has(dish._id || dish.id))
    .map(publicDish);
  const referencedCategoryIds = new Set(dishes.map(dish => dish.categoryId).filter(Boolean));
  const referencedCategoryNames = new Set(dishes.map(dish => dish.categoryName).filter(Boolean));
  const categories = rawCategories
    .map(publicCategory)
    .filter(category => referencedCategoryIds.has(category.id) || referencedCategoryNames.has(category.name));
  return { items: mealSets, dishes, categories };
}

async function listMealSets() {
  const items = sortMealSets((await fetchAll('mealSets'))
    .map(publicMealSet)
    .filter(item => item.enabled));
  return success(await buildMealSetBundle(items));
}

async function getMealSetDetail(event) {
  const item = publicMealSet(await getMealSetDocument(event.mealSetId));
  if (!item.enabled) throw appError('NOT_FOUND', '套餐不存在或已停用');
  const bundle = await buildMealSetBundle([item]);
  return success({ item, dishes: bundle.dishes, categories: bundle.categories });
}

async function listManageMealSets(event, openid) {
  await assertAdmin(openid);
  const items = sortMealSets((await fetchAll('mealSets')).map(publicMealSet));
  return success(await buildMealSetBundle(items));
}

async function getManageMealSet(event, openid) {
  await assertAdmin(openid);
  const item = publicMealSet(await getMealSetDocument(event.mealSetId));
  const bundle = await buildMealSetBundle([item]);
  return success({ item, dishes: bundle.dishes, categories: bundle.categories });
}

async function createMealSet(event, openid) {
  await assertAdmin(openid);
  const mealSet = mealSetForWrite(event.mealSet || {});
  await assertMealSetDishesExist(mealSet.items);
  const id = safeDocumentId('meal_set', event.mealSet && event.mealSet.id);
  const now = db.serverDate();
  await db.collection('mealSets').doc(id).set({
    data: {
      id,
      ...mealSet,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: openid,
      updatedBy: openid,
    },
  });
  return success({ id });
}

async function updateMealSet(event, openid) {
  await assertAdmin(openid);
  const mealSetId = cleanString(event.mealSetId, 100);
  const current = await getMealSetDocument(mealSetId);
  const patch = event.patch || {};
  const mealSet = mealSetForWrite({ ...publicMealSet(current), ...patch });
  // 套餐引用的菜后来被删除时，仍允许管理员先停用套餐；只有显式保存 items 时才重新校验引用。
  if (hasOwn(patch, 'items')) await assertMealSetDishesExist(mealSet.items);
  await db.collection('mealSets').doc(mealSetId).update({
    data: {
      ...mealSet,
      schemaVersion: 1,
      updatedAt: db.serverDate(),
      updatedBy: openid,
    },
  });
  return success({ id: mealSetId });
}

async function deleteMealSet(event, openid) {
  await assertAdmin(openid);
  const mealSetId = cleanString(event.mealSetId, 100);
  if (!mealSetId) throw appError('INVALID_MEAL_SET', '缺少套餐 ID');
  await getMealSetDocument(mealSetId);
  await db.collection('mealSets').doc(mealSetId).remove();
  return success({ id: mealSetId });
}

const handlers = {
  getSession: (event, openid) => getSession(openid),
  listDishes,
  listCategories,
  getCatalog,
  getDishDetail,
  createDish,
  updateDish,
  deleteDish,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  seedDefaultCategories,
  seedMenuCatalog,
  importLegacyDishes,
  migrateDishesV2,
  createOrder,
  listMyOrders,
  getMyOpenOrderSummary,
  getMyOrderDetail,
  cancelMyOrder,
  listManageOrders,
  getManageOrderDetail,
  updateOrderStatus,
  listMealSets,
  getMealSetDetail,
  listManageMealSets,
  getManageMealSet,
  createMealSet,
  updateMealSet,
  deleteMealSet,
};

exports.main = async event => {
  try {
    const { OPENID: openid } = cloud.getWXContext();
    if (!openid) throw appError('UNAUTHENTICATED', '无法识别当前微信用户');
    const handler = handlers[event && event.action];
    if (!handler) throw appError('UNKNOWN_ACTION', '未知操作');
    const isCatalogWrite = CATALOG_WRITE_ACTIONS.has(event.action)
      && !(event.action === 'migrateDishesV2' && event.dryRun !== false); // dryRun 不改数据
    let result;
    try {
      result = await handler(event || {}, openid);
    } catch (error) {
      // 权限/校验错误发生在写入之前，不更新版本号（避免非管理员反复触发全员重拉）；
      // 意外错误可能已写入一部分，更新版本号让客户端重新拉菜单。
      if (isCatalogWrite && error.isAppError !== true) await bumpCatalogVersion();
      throw error;
    }
    if (isCatalogWrite) await bumpCatalogVersion();
    return result;
  } catch (error) {
    console.error('familyApi failed', { action: event && event.action, code: error.code, message: error.message });
    return {
      success: false,
      code: error.isAppError === true ? error.code : 'INTERNAL_ERROR',
      message: error.isAppError === true ? error.message : '服务暂时不可用，请稍后重试',
    };
  }
};
