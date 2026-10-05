const { cleanString, isCloudFileID } = require('./schema');

const MAX_MEAL_SET_ITEMS = 20;
const MAX_MEAL_SET_QUANTITY = 99;
const MAX_MEAL_SET_TAGS = 10;

function mealSetError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.isAppError = true;
  return error;
}

function assertBoolean(value, fieldName) {
  if (value !== true && value !== false) throw mealSetError('INVALID_MEAL_SET', `${fieldName} 必须是布尔值`);
  return value;
}

function normalizeMealSetItems(items, options = {}) {
  if (!Array.isArray(items)) throw mealSetError('INVALID_MEAL_SET_ITEMS', '套餐商品必须是数组');
  if (items.length < 1) throw mealSetError('INVALID_MEAL_SET_ITEMS', '套餐至少需要 1 个商品');
  if (items.length > MAX_MEAL_SET_ITEMS) {
    throw mealSetError('INVALID_MEAL_SET_ITEMS', `套餐最多包含 ${MAX_MEAL_SET_ITEMS} 个不同商品`);
  }
  const usedDishIds = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw mealSetError('INVALID_MEAL_SET_ITEM', '套餐商品格式不正确');
    }
    if (typeof item.dishId !== 'string') throw mealSetError('INVALID_MEAL_SET_ITEM', 'dishId 必须是文本');
    const dishId = cleanString(item.dishId, 100);
    if (!dishId) throw mealSetError('INVALID_MEAL_SET_ITEM', 'dishId 不能为空');
    if (usedDishIds.has(dishId)) throw mealSetError('DUPLICATE_MEAL_SET_DISH', '同一个商品不能在套餐中重复出现');
    usedDishIds.add(dishId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_MEAL_SET_QUANTITY) {
      throw mealSetError('INVALID_MEAL_SET_QUANTITY', '套餐商品数量必须是 1～99 的整数');
    }
    return { dishId, quantity };
  });
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw mealSetError('INVALID_MEAL_SET_TAGS', '套餐标签必须是数组');
  if (value.length > MAX_MEAL_SET_TAGS) throw mealSetError('INVALID_MEAL_SET_TAGS', '套餐标签最多 10 个');
  const tags = value.map(item => {
    if (typeof item !== 'string') throw mealSetError('INVALID_MEAL_SET_TAGS', '套餐标签只能包含文本');
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 20) throw mealSetError('INVALID_MEAL_SET_TAGS', '每个套餐标签需为 1～20 个字符');
    return trimmed;
  });
  if (new Set(tags).size !== tags.length) throw mealSetError('INVALID_MEAL_SET_TAGS', '套餐标签不能重复');
  return tags;
}

function mealSetForWrite(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw mealSetError('INVALID_MEAL_SET', '套餐数据格式不正确');
  }
  if (typeof raw.name !== 'string') throw mealSetError('INVALID_MEAL_SET', '套餐名称必须是文本');
  const name = raw.name.trim();
  if (!name || name.length > 30) throw mealSetError('INVALID_MEAL_SET', '套餐名称需为 1～30 个字符');
  if (raw.description !== undefined && raw.description !== null && typeof raw.description !== 'string') {
    throw mealSetError('INVALID_MEAL_SET', '套餐简介必须是文本');
  }
  const description = String(raw.description || '').trim();
  if (description.length > 200) throw mealSetError('INVALID_MEAL_SET', '套餐简介不能超过 200 个字符');
  if (raw.cover !== undefined && raw.cover !== null && typeof raw.cover !== 'string') {
    throw mealSetError('INVALID_MEAL_SET_COVER', '套餐封面必须是文本');
  }
  const cover = cleanString(raw.cover, 1000);
  if (cover && !isCloudFileID(cover)) {
    throw mealSetError('INVALID_MEAL_SET_COVER', '套餐封面必须是云存储 fileID');
  }
  const sort = raw.sort === '' || raw.sort === undefined || raw.sort === null ? 0 : Number(raw.sort);
  if (!Number.isFinite(sort)) throw mealSetError('INVALID_MEAL_SET_SORT', '套餐排序必须是数字');
  return {
    name,
    description,
    cover,
    tags: normalizeTags(raw.tags),
    items: normalizeMealSetItems(raw.items),
    enabled: raw.enabled === undefined ? true : assertBoolean(raw.enabled, 'enabled'),
    recommended: raw.recommended === undefined ? false : assertBoolean(raw.recommended, 'recommended'),
    sort,
  };
}

function publicMealSet(raw = {}) {
  try {
    return {
      ...raw,
      ...mealSetForWrite({
        ...raw,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : '未命名套餐',
        items: Array.isArray(raw.items) && raw.items.length ? raw.items : [{ dishId: 'invalid', quantity: 1 }],
      }),
      id: raw.id || raw._id || '',
      items: Array.isArray(raw.items) ? raw.items.map(item => ({
        dishId: cleanString(item && item.dishId, 100),
        quantity: Math.max(1, Math.min(99, Math.floor(Number(item && item.quantity) || 1))),
      })).filter(item => item.dishId) : [],
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  } catch (error) {
    return {
      id: raw.id || raw._id || '',
      name: cleanString(raw.name, 30) || '未命名套餐',
      description: cleanString(raw.description, 200),
      cover: isCloudFileID(raw.cover) ? raw.cover : '',
      tags: [],
      items: [],
      enabled: raw.enabled !== false,
      recommended: raw.recommended === true,
      sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  }
}

module.exports = {
  MAX_MEAL_SET_ITEMS,
  MAX_MEAL_SET_QUANTITY,
  MAX_MEAL_SET_TAGS,
  mealSetForWrite,
  normalizeMealSetItems,
  publicMealSet,
};
