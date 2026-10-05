const { callFamilyApi } = require('./cloud');
const {
  categoriesFromDishes,
  normalizeCategory,
  normalizeDish,
  prepareCategoryWritePayload,
  prepareDishWritePayload,
} = require('../utils/schema');

let catalogRevision = 0;
const DISH_SNAPSHOT_KEY = 'family_catalog_dishes_v1';
const CATEGORY_SNAPSHOT_KEY = 'family_catalog_categories_v1';

function saveReadOnlySnapshot(key, items) {
  try { wx.setStorageSync(key, { version: 1, items }); }
  catch (error) { console.warn('保存只读菜单快照失败', error); }
}

function readSnapshot(key) {
  try {
    const saved = wx.getStorageSync(key);
    return saved && saved.version === 1 && Array.isArray(saved.items) ? saved.items : null;
  } catch (_) { return null; }
}

function getCachedCatalog() {
  return { dishes: readSnapshot(DISH_SNAPSHOT_KEY) || [], categories: readSnapshot(CATEGORY_SNAPSHOT_KEY) || [] };
}

async function callCatalogWrite(action, data) {
  const result = await callFamilyApi(action, data);
  catalogRevision += 1;
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
  try {
    const data = await callFamilyApi('listDishes', { includeDisabled });
    const items = (data.items || []).map(normalizeDish);
    if (!includeDisabled) saveReadOnlySnapshot(DISH_SNAPSHOT_KEY, items);
    return {
      items,
      source: 'cloud',
    };
  } catch (error) {
    if (includeDisabled || options.allowLocalFallback === false) throw error;
    const cached = readSnapshot(DISH_SNAPSHOT_KEY);
    if (cached) return { items: cached.map(normalizeDish), source: 'cache' };
    console.warn('云端菜品读取失败，暂时读取本机旧数据', error);
    return { items: getLocalDishes().filter(item => item.enabled), source: 'local' };
  }
}

async function listCategories(options = {}) {
  const includeDisabled = Boolean(options.includeDisabled);
  try {
    const data = await callFamilyApi('listCategories', { includeDisabled });
    const items = (data.items || []).map(normalizeCategory);
    if (!includeDisabled) saveReadOnlySnapshot(CATEGORY_SNAPSHOT_KEY, items);
    return {
      items,
      source: 'cloud',
    };
  } catch (error) {
    if (includeDisabled || options.allowLocalFallback === false) throw error;
    const cached = readSnapshot(CATEGORY_SNAPSHOT_KEY);
    if (cached) return { items: cached.map(normalizeCategory), source: 'cache' };
    console.warn('云端分类读取失败，暂时从本机旧菜品推导分类', error);
    return { items: categoriesFromDishes(getLocalDishes()), source: 'local' };
  }
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
  getCatalogRevision,
  importLegacyDishes,
  listCategories,
  listDishes,
  migrateDishesV2,
  reorderCategories,
  seedDefaultCategories,
  updateCategory,
  updateDish,
};
