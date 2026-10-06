const { callFamilyApi } = require('./cloud');
const {
  categoriesFromDishes,
  normalizeCategory,
  normalizeDish,
  prepareCategoryWritePayload,
  prepareDishWritePayload,
} = require('../utils/schema');

let catalogRevision = 0;
// v2 快照：头部记录版本号/时间/分块数，菜品按块存，避免菜多时单个 key 超过 1MB。
const SNAPSHOT_HEADER_KEY = 'family_catalog_v2';
const SNAPSHOT_DISH_CHUNK_PREFIX = 'family_catalog_v2_dishes_';
const SNAPSHOT_CHUNK_SIZE = 200;
// 旧版 v1 快照仍可读取，升级后第一次打开也能秒开。
const DISH_SNAPSHOT_KEY = 'family_catalog_dishes_v1';
const CATEGORY_SNAPSHOT_KEY = 'family_catalog_categories_v1';
// 内存里的目录在这段时间内直接复用，页面之间跳转不再重复请求。
const MEMORY_TTL_MS = 60 * 1000;
// 超过这个时间不再信任本地版本号，强制完整拉取一次（防止控制台直接改库导致版本号没变）。
const SNAPSHOT_TRUST_MS = 12 * 60 * 60 * 1000;
const DETAIL_CACHE_LIMIT = 60;

let memory = null;
let inflight = null;
let snapshotCache;
const detailCache = new Map();

function now() {
  return Date.now();
}

function isUnknownAction(error) {
  return Boolean(error && error.code === 'UNKNOWN_ACTION');
}

// 去掉空字符串/空数组/null，读回时 normalizeDish 会补默认值；布尔 false 必须保留。
function compactItem(item) {
  const result = {};
  Object.keys(item).forEach(key => {
    const value = item[key];
    if (value === '' || value === null || value === undefined) return;
    if (Array.isArray(value) && value.length === 0) return;
    result[key] = value;
  });
  return result;
}

function writeStorage(key, value) {
  if (typeof wx.setStorage === 'function') {
    wx.setStorage({ key, data: value, fail: error => console.warn('保存只读菜单快照失败', key, error) });
    return;
  }
  try { wx.setStorageSync(key, value); } catch (error) { console.warn('保存只读菜单快照失败', key, error); }
}

function readStorage(key) {
  try { return wx.getStorageSync(key); } catch (_) { return null; }
}

function removeStorage(key) {
  try {
    if (typeof wx.removeStorage === 'function') wx.removeStorage({ key, fail() {} });
    else if (typeof wx.removeStorageSync === 'function') wx.removeStorageSync(key);
  } catch (_) { /* 清理失败不影响使用。 */ }
}

function saveSnapshot(catalog) {
  const previous = readStorage(SNAPSHOT_HEADER_KEY);
  const chunks = [];
  for (let index = 0; index < catalog.dishes.length; index += SNAPSHOT_CHUNK_SIZE) {
    chunks.push(catalog.dishes.slice(index, index + SNAPSHOT_CHUNK_SIZE).map(compactItem));
  }
  chunks.forEach((chunk, index) => writeStorage(`${SNAPSHOT_DISH_CHUNK_PREFIX}${index}`, chunk));
  const previousChunks = previous && Number(previous.dishChunks) || 0;
  for (let index = chunks.length; index < previousChunks; index += 1) removeStorage(`${SNAPSHOT_DISH_CHUNK_PREFIX}${index}`);
  writeStorage(SNAPSHOT_HEADER_KEY, {
    version: 2,
    catalogVersion: catalog.version || '',
    savedAt: now(),
    dishChunks: chunks.length,
    dishCount: catalog.dishes.length,
    categories: catalog.categories.map(compactItem),
  });
  snapshotCache = { ...catalog, savedAt: now() };
}

function touchSnapshot(snapshot) {
  const header = readStorage(SNAPSHOT_HEADER_KEY);
  if (header && header.version === 2) writeStorage(SNAPSHOT_HEADER_KEY, { ...header, savedAt: now() });
  snapshotCache = { ...snapshot, savedAt: now() };
}

function readSnapshot() {
  if (snapshotCache !== undefined) return snapshotCache;
  snapshotCache = null;
  const header = readStorage(SNAPSHOT_HEADER_KEY);
  if (header && header.version === 2 && Array.isArray(header.categories)) {
    const dishes = [];
    for (let index = 0; index < (Number(header.dishChunks) || 0); index += 1) {
      const chunk = readStorage(`${SNAPSHOT_DISH_CHUNK_PREFIX}${index}`);
      if (!Array.isArray(chunk)) return snapshotCache; // 分块不完整时当作没有快照。
      dishes.push(...chunk);
    }
    if (dishes.length === (Number(header.dishCount) || 0)) {
      snapshotCache = {
        version: header.catalogVersion || '',
        savedAt: Number(header.savedAt) || 0,
        dishes: dishes.map(normalizeDish),
        categories: header.categories.map(normalizeCategory),
      };
    }
    return snapshotCache;
  }
  const legacyDishes = readStorage(DISH_SNAPSHOT_KEY);
  const legacyCategories = readStorage(CATEGORY_SNAPSHOT_KEY);
  if (legacyDishes && legacyDishes.version === 1 && Array.isArray(legacyDishes.items)) {
    snapshotCache = {
      version: '',
      savedAt: 0,
      dishes: legacyDishes.items.map(normalizeDish),
      categories: legacyCategories && legacyCategories.version === 1 && Array.isArray(legacyCategories.items)
        ? legacyCategories.items.map(normalizeCategory) : [],
    };
  }
  return snapshotCache;
}

function getCachedCatalog() {
  if (memory) return { dishes: memory.dishes, categories: memory.categories };
  const snapshot = readSnapshot();
  return snapshot
    ? { dishes: snapshot.dishes, categories: snapshot.categories }
    : { dishes: [], categories: [] };
}

function rememberCatalog(catalog, source) {
  if (memory && memory.version !== catalog.version) detailCache.clear();
  memory = {
    ...catalog,
    source,
    revision: catalogRevision,
    fetchedAt: now(),
    byId: new Map(catalog.dishes.map(dish => [dish.id, dish])),
  };
  return memory;
}

async function fetchLegacyCatalog() {
  const [dishData, categoryData] = await Promise.all([
    callFamilyApi('listDishes', { summary: true }),
    callFamilyApi('listCategories'),
  ]);
  return { version: '', dishes: dishData.items || [], categories: categoryData.items || [] };
}

async function fetchCatalog(force) {
  const snapshot = readSnapshot();
  const trusted = snapshot && snapshot.version && now() - snapshot.savedAt < SNAPSHOT_TRUST_MS;
  let data;
  try {
    data = await callFamilyApi('getCatalog', { knownVersion: !force && trusted ? snapshot.version : '' });
  } catch (error) {
    // 云函数还没重新部署时退回旧接口，功能不受影响。
    if (!isUnknownAction(error)) throw error;
    data = await fetchLegacyCatalog();
  }
  if (data.notModified && snapshot) {
    touchSnapshot(snapshot);
    return { version: data.version, dishes: snapshot.dishes, categories: snapshot.categories };
  }
  if (data.notModified) {
    // 理论上不会发生（没有快照就不会带版本号）；保险起见完整拉一次。
    data = await callFamilyApi('getCatalog', { knownVersion: '' });
  }
  const catalog = {
    version: data.version || '',
    dishes: (data.dishes || []).map(normalizeDish),
    categories: (data.categories || []).map(normalizeCategory),
  };
  saveSnapshot(catalog);
  return catalog;
}

/**
 * 读取顾客可见的菜单目录（摘要，不含做法）。
 * 同一时间只会有一个请求；60 秒内重复调用直接返回内存数据。
 */
async function loadCatalog(options = {}) {
  const force = Boolean(options.force);
  const fresh = memory && memory.source === 'cloud' && memory.revision === catalogRevision
    && now() - memory.fetchedAt < MEMORY_TTL_MS;
  if (!force && fresh) return memory;
  if (!inflight) {
    inflight = fetchCatalog(force)
      .then(catalog => rememberCatalog(catalog, 'cloud'))
      .finally(() => { inflight = null; });
  }
  try {
    return await inflight;
  } catch (error) {
    if (options.allowLocalFallback === false) throw error;
    const snapshot = readSnapshot();
    if (snapshot) return { ...snapshot, source: 'cache' };
    console.warn('云端菜单读取失败，暂时读取本机旧数据', error);
    const dishes = getLocalDishes().filter(item => item.enabled);
    return { version: '', dishes, categories: categoriesFromDishes(dishes), source: 'local' };
  }
}

/** 同步读取一道菜的摘要（内存或本地快照），用于详情页“先出画面”。 */
function peekDish(dishId) {
  if (!dishId) return null;
  if (memory && memory.byId.has(dishId)) return memory.byId.get(dishId);
  const snapshot = readSnapshot();
  return snapshot ? snapshot.dishes.find(item => item.id === dishId) || null : null;
}

function cacheDetail(dishId, item) {
  detailCache.delete(dishId);
  detailCache.set(dishId, { item, revision: catalogRevision });
  while (detailCache.size > DETAIL_CACHE_LIMIT) detailCache.delete(detailCache.keys().next().value);
}

/** 读取一道菜的完整信息（含做法、食材、图集）。 */
async function getDishDetail(dishId, options = {}) {
  const includeDisabled = Boolean(options.includeDisabled);
  const cached = detailCache.get(dishId);
  if (!options.force && !includeDisabled && cached && cached.revision === catalogRevision) return { item: cached.item };
  let item;
  try {
    const data = await callFamilyApi('getDishDetail', { dishId, includeDisabled });
    item = data.item ? normalizeDish(data.item) : null;
  } catch (error) {
    if (!isUnknownAction(error)) throw error;
    const data = await callFamilyApi('listDishes', { includeDisabled });
    const raw = (data.items || []).find(dish => (dish.id || dish._id) === dishId);
    item = raw ? normalizeDish(raw) : null;
  }
  if (item && !includeDisabled) cacheDetail(dishId, item);
  return { item };
}

async function callCatalogWrite(action, data) {
  const result = await callFamilyApi(action, data);
  catalogRevision += 1;
  detailCache.clear();
  return result;
}

function getCatalogRevision() {
  return catalogRevision;
}

function getLocalDishes() {
  return (wx.getStorageSync('dishes') || []).map(normalizeDish);
}

async function listDishes(options = {}) {
  const includeDisabled = Boolean(options.includeDisabled);
  if (includeDisabled) {
    // 管理端列表只需要摘要；编辑单道菜时用 getDishDetail 取完整数据。
    const data = await callFamilyApi('listDishes', { includeDisabled, summary: true });
    return { items: (data.items || []).map(normalizeDish), source: 'cloud' };
  }
  const catalog = await loadCatalog(options);
  return { items: catalog.dishes, source: catalog.source };
}

async function listCategories(options = {}) {
  const includeDisabled = Boolean(options.includeDisabled);
  if (includeDisabled) {
    const data = await callFamilyApi('listCategories', { includeDisabled });
    return { items: (data.items || []).map(normalizeCategory), source: 'cloud' };
  }
  const catalog = await loadCatalog(options);
  return { items: catalog.categories, source: catalog.source };
}

async function getDish(dishId, options = {}) {
  const result = await listDishes(options);
  return {
    item: result.items.find(item => item.id === dishId) || null,
    source: result.source,
  };
}

async function createDish(dish) {
  return callCatalogWrite('createDish', { dish: prepareDishWritePayload(dish) });
}

async function updateDish(dishId, patch) {
  return callCatalogWrite('updateDish', { dishId, patch: prepareDishWritePayload(patch) });
}

async function deleteDish(dishId) {
  return callCatalogWrite('deleteDish', { dishId });
}

async function createCategory(category) {
  return callCatalogWrite('createCategory', { category: prepareCategoryWritePayload(category) });
}

async function updateCategory(categoryId, patch) {
  return callCatalogWrite('updateCategory', { categoryId, patch: prepareCategoryWritePayload(patch) });
}

async function deleteCategory(categoryId) {
  return callCatalogWrite('deleteCategory', { categoryId });
}

async function seedDefaultCategories() {
  return callCatalogWrite('seedDefaultCategories');
}

async function reorderCategories(categoryIds) {
  return callCatalogWrite('reorderCategories', { categoryIds });
}

async function importLegacyDishes(dishes, overwrite = false) {
  return callCatalogWrite('importLegacyDishes', { dishes, overwrite });
}

async function migrateDishesV2(dryRun = true) {
  return callCatalogWrite('migrateDishesV2', { dryRun: dryRun !== false });
}

module.exports = {
  createCategory,
  createDish,
  deleteCategory,
  deleteDish,
  getLocalDishes,
  getCachedCatalog,
  getDish,
  getDishDetail,
  getCatalogRevision,
  importLegacyDishes,
  listCategories,
  listDishes,
  loadCatalog,
  migrateDishesV2,
  peekDish,
  reorderCategories,
  seedDefaultCategories,
  updateCategory,
  updateDish,
};
