const cartUtils = require('../utils/cart');

const STORAGE_KEY = 'family_cart_v2';
const LEGACY_STORAGE_KEY = 'cart';

function readStorage(key) {
  try {
    return wx.getStorageSync(key);
  } catch (error) {
    console.warn(`读取本地点菜单失败：${key}`, error);
    return null;
  }
}

function saveCart(items) {
  const normalized = cartUtils.migrateLegacyCart({ items }).items;
  wx.setStorageSync(STORAGE_KEY, {
    schemaVersion: cartUtils.CART_SCHEMA_VERSION,
    items: normalized,
    updatedAt: Date.now(),
  });
  return normalized;
}

function loadCart(options = {}) {
  const current = readStorage(STORAGE_KEY);
  const hasCurrent = Boolean(current && typeof current === 'object' && Array.isArray(current.items));
  const source = hasCurrent ? current : readStorage(LEGACY_STORAGE_KEY);
  const result = cartUtils.migrateLegacyCart(source, { dishes: options.dishes || [] });
  if (result.warnings.length > 0) {
    console.warn('部分旧购物车数据无法安全迁移，已忽略', result.warnings);
  }
  return saveCart(result.items);
}

function addItem(item, options = {}) {
  const items = loadCart(options);
  return saveCart(cartUtils.addItem(items, item));
}

function buildDishCartItem(dish = {}, selectedOptions = {}, quantity = 1) {
  return {
    dishId: dish.id || dish._id,
    name: dish.name,
    type: dish.type,
    cover: dish.cover || dish.image || '',
    unitPrice: dish.price,
    quantity,
    selectedOptions,
    categoryId: dish.categoryId,
    dishSnapshot: {
      name: dish.name,
      type: dish.type,
      cover: dish.cover || dish.image || '',
      unitPrice: dish.price,
      categoryId: dish.categoryId,
      updatedAt: dish.updatedAt || null,
    },
  };
}

function addDish(dish, selectedOptions, quantity = 1, options = {}) {
  return addItem(buildDishCartItem(dish, selectedOptions, quantity), options);
}

function addDishes(entries = [], options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return loadCart(options);
  const prepared = entries.map(entry => {
    if (!entry || !entry.dish) throw new Error('随机搭配中存在无效商品');
    return buildDishCartItem(
      entry.dish,
      entry.selectedOptions || {},
      entry.quantity === undefined ? 1 : entry.quantity,
    );
  });
  let items = loadCart(options);
  prepared.forEach(item => {
    items = cartUtils.addItem(items, item);
  });
  return saveCart(items);
}

function replaceItem(identifier, dish, selectedOptions, quantity = 1, options = {}) {
  const items = loadCart(options);
  const withoutCurrent = cartUtils.removeItem(items, identifier);
  return saveCart(cartUtils.addItem(
    withoutCurrent,
    buildDishCartItem(dish, selectedOptions, quantity),
  ));
}

function updateQuantity(identifier, quantity) {
  const items = loadCart();
  return saveCart(cartUtils.updateQuantity(items, identifier, quantity));
}

function removeItem(identifier) {
  const items = loadCart();
  return saveCart(cartUtils.removeItem(items, identifier));
}

function clearCart() {
  return saveCart(cartUtils.clearCart());
}

function getItemCount(items) {
  return cartUtils.getItemCount(Array.isArray(items) ? items : loadCart());
}

function getTotalAmount(items) {
  return cartUtils.getTotalAmount(Array.isArray(items) ? items : loadCart());
}

module.exports = {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  addDish,
  addDishes,
  addItem,
  clearCart,
  getItemCount,
  getTotalAmount,
  loadCart,
  replaceItem,
  removeItem,
  saveCart,
  updateQuantity,
};
