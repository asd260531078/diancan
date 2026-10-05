const CART_SCHEMA_VERSION = 2;
const MAX_QUANTITY = 99;
const { normalizeSugarLevels } = require('../config/drink-options');

function cartError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizeStringSet(value, maxItems = 100, maxLength = 80) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map(item => cleanString(item, maxLength))
    .filter(Boolean)
    .filter((item, index, values) => values.indexOf(item) === index)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .slice(0, maxItems);
}

function canonicalizeSelectedOptions(type, raw = {}) {
  if (type === 'drink') {
    return {
      cupSize: cleanString(raw.cupSize, 80),
      sugarLevel: normalizeSugarLevels([raw.sugarLevel])[0] || '',
      temperature: cleanString(raw.temperature, 80),
      sweetener: cleanString(raw.sweetener, 80),
      toppings: normalizeStringSet(raw.toppings),
    };
  }
  if (type === 'food') {
    return {
      tastePreference: cleanString(raw.tastePreference, 80),
      customRequests: normalizeStringSet(raw.customRequests),
    };
  }
  throw cartError('INVALID_CART_ITEM_TYPE', '购物车商品类型必须是 food 或 drink');
}

function buildCartKey(dishId, type, selectedOptions = {}) {
  const safeDishId = cleanString(dishId, 100);
  if (!safeDishId) throw cartError('INVALID_CART_DISH', '购物车商品缺少 dishId');
  const canonical = canonicalizeSelectedOptions(type, selectedOptions);
  return `${safeDishId}::${type}::${encodeURIComponent(JSON.stringify(canonical))}`;
}

function buildSummaryText(type, selectedOptions = {}) {
  const options = canonicalizeSelectedOptions(type, selectedOptions);
  if (type === 'drink') {
    return [
      options.cupSize,
      options.sugarLevel,
      options.temperature,
      options.sweetener,
      ...options.toppings,
    ].filter(Boolean).join(' / ');
  }
  return [options.tastePreference, ...options.customRequests].filter(Boolean).join(' / ');
}

function normalizeUnitPrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeStoredQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.floor(parsed)));
}

function createCartItemId(now = Date.now()) {
  return `cart_${now}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCartItem(raw = {}, options = {}) {
  const dishId = cleanString(raw.dishId || raw.id, 100);
  const type = raw.type;
  const name = cleanString(raw.name, 100);
  if (!dishId || !name) throw cartError('INVALID_CART_ITEM', '购物车商品信息不完整');
  if (type !== 'food' && type !== 'drink') {
    throw cartError('INVALID_CART_ITEM_TYPE', '购物车商品类型必须是 food 或 drink');
  }

  const selectedOptions = canonicalizeSelectedOptions(type, raw.selectedOptions || {});
  const unitPrice = normalizeUnitPrice(
    raw.unitPrice !== undefined ? raw.unitPrice : (raw.basePrice !== undefined ? raw.basePrice : raw.price),
  );
  const quantity = normalizeStoredQuantity(raw.quantity !== undefined ? raw.quantity : raw.num);
  const cover = cleanString(raw.cover || raw.image, 1000);
  const categoryId = cleanString(raw.categoryId, 100);
  const snapshotSource = raw.dishSnapshot && typeof raw.dishSnapshot === 'object'
    ? raw.dishSnapshot
    : {};
  const createdAtValue = Number(raw.createdAt);
  const createdAt = Number.isFinite(createdAtValue) && createdAtValue > 0
    ? createdAtValue
    : (Number(options.now) || Date.now());

  return {
    cartItemId: cleanString(raw.cartItemId, 100) || createCartItemId(createdAt),
    cartKey: buildCartKey(dishId, type, selectedOptions),
    dishId,
    name,
    type,
    cover,
    unitPrice,
    quantity,
    selectedOptions,
    summaryText: buildSummaryText(type, selectedOptions),
    categoryId,
    dishSnapshot: {
      name: cleanString(snapshotSource.name || name, 100),
      type,
      cover: cleanString(snapshotSource.cover || cover, 1000),
      unitPrice: normalizeUnitPrice(
        snapshotSource.unitPrice !== undefined ? snapshotSource.unitPrice : unitPrice,
      ),
      categoryId: cleanString(snapshotSource.categoryId || categoryId, 100),
      updatedAt: snapshotSource.updatedAt || raw.updatedAt || null,
    },
    createdAt,
  };
}

function hasDrinkOptions(dish = {}) {
  return [
    dish.availableCupSizes,
    dish.availableSugarLevels,
    Array.isArray(dish.availableTemperatures) && dish.availableTemperatures.length > 0
      ? dish.availableTemperatures
      : dish.availableIceLevels,
    dish.availableSweetenerTypes,
    dish.availableToppings,
  ].some(values => Array.isArray(values) && values.length > 0);
}

function hasFoodOptions(dish = {}) {
  return [dish.availableTastePreferences, dish.availableCustomRequests]
    .some(values => Array.isArray(values) && values.length > 0);
}

function addItem(items = [], rawItem, options = {}) {
  const normalized = normalizeCartItem(rawItem, options);
  const next = items.map(item => normalizeCartItem(item, options));
  const existingIndex = next.findIndex(item => item.cartKey === normalized.cartKey);
  if (existingIndex < 0) return [...next, normalized];

  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    quantity: Math.min(MAX_QUANTITY, existing.quantity + normalized.quantity),
  };
  return next;
}

function updateQuantity(items = [], identifier, quantity, options = {}) {
  const safeIdentifier = cleanString(identifier, 20000);
  const parsed = Number(quantity);
  if (!safeIdentifier) throw cartError('INVALID_CART_ITEM', '缺少购物车项目标识');
  if (!Number.isFinite(parsed)) throw cartError('INVALID_QUANTITY', '数量必须是有效数字');
  if (parsed <= 0) return removeItem(items, safeIdentifier, options);
  const safeQuantity = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(parsed)));
  return items.map(raw => {
    const item = normalizeCartItem(raw, options);
    if (item.cartItemId !== safeIdentifier && item.cartKey !== safeIdentifier) return item;
    return { ...item, quantity: safeQuantity };
  });
}

function removeItem(items = [], identifier, options = {}) {
  const safeIdentifier = cleanString(identifier, 20000);
  return items
    .map(item => normalizeCartItem(item, options))
    .filter(item => item.cartItemId !== safeIdentifier && item.cartKey !== safeIdentifier);
}

function clearCart() {
  return [];
}

function getItemCount(items = []) {
  return items.reduce((total, raw) => total + normalizeStoredQuantity(raw.quantity), 0);
}

function getTotalAmount(items = []) {
  const cents = items.reduce((total, raw) => {
    const price = normalizeUnitPrice(raw.unitPrice);
    if (price === null) return total;
    return total + Math.round(price * 100) * normalizeStoredQuantity(raw.quantity);
  }, 0);
  return cents / 100;
}

function dishesById(dishes = []) {
  return dishes.reduce((result, dish) => {
    const id = cleanString(dish && (dish.id || dish._id), 100);
    if (id) result[id] = dish;
    return result;
  }, {});
}

function migrateLegacyCart(rawCart, options = {}) {
  const sourceItems = Array.isArray(rawCart)
    ? rawCart
    : (rawCart && Array.isArray(rawCart.items) ? rawCart.items : []);
  const lookup = dishesById(options.dishes || []);
  const warnings = [];
  let items = [];

  sourceItems.forEach((raw, index) => {
    try {
      const dishId = cleanString(raw && (raw.dishId || raw.id), 100);
      const dish = lookup[dishId] || null;
      const isV2Item = Boolean(raw && raw.cartItemId && raw.cartKey && raw.selectedOptions && raw.type);
      const type = raw && raw.type || dish && dish.type;
      if (!dishId || (type !== 'food' && type !== 'drink')) {
        throw cartError('UNSAFE_LEGACY_CART_ITEM', '无法确认商品类型');
      }
      if (!isV2Item) {
        if (!dish) throw cartError('UNSAFE_LEGACY_CART_ITEM', '找不到对应的最新菜品');
        if (type === 'drink' && hasDrinkOptions(dish)) {
          throw cartError('UNSAFE_LEGACY_CART_ITEM', '旧饮品缺少规格选择');
        }
        if (type === 'food' && hasFoodOptions(dish)) {
          throw cartError('UNSAFE_LEGACY_CART_ITEM', '旧菜品缺少口味选择');
        }
      }

      const source = {
        ...raw,
        dishId,
        type,
        name: cleanString(raw.name || dish && dish.name, 100),
        cover: cleanString(raw.cover || raw.image || dish && (dish.cover || dish.image), 1000),
        unitPrice: dish && dish.price !== undefined ? dish.price : raw.unitPrice !== undefined ? raw.unitPrice : raw.price,
        quantity: raw.quantity !== undefined ? raw.quantity : raw.num,
        categoryId: raw.categoryId || dish && dish.categoryId || '',
        selectedOptions: raw.selectedOptions || {},
      };
      items = addItem(items, source, options);
    } catch (error) {
      warnings.push(`第 ${index + 1} 项已忽略：${error.message}`);
    }
  });

  return { items, warnings };
}

module.exports = {
  CART_SCHEMA_VERSION,
  MAX_QUANTITY,
  addItem,
  buildCartKey,
  buildSummaryText,
  canonicalizeSelectedOptions,
  clearCart,
  getItemCount,
  getTotalAmount,
  hasDrinkOptions,
  hasFoodOptions,
  migrateLegacyCart,
  normalizeCartItem,
  normalizeUnitPrice,
  removeItem,
  updateQuantity,
};
