const {
  MAX_QUANTITY,
  buildSummaryText,
  canonicalizeSelectedOptions,
  getItemCount,
  getTotalAmount,
  normalizeUnitPrice,
} = require('../../utils/cart');
const { getDishRestriction } = require('../../utils/dish-status');
const { getSupportedDrinkOptions } = require('../../utils/drink-selection');
const { getSupportedFoodOptions } = require('../../utils/food-selection');
const { roundMoney } = require('../../utils/money');

const MAX_ORDER_NOTE_LENGTH = 200;

function draftError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createRequestId(nowValue = Date.now(), randomValue = Math.random()) {
  const random = Math.floor(Number(randomValue) * 0xFFFFFFFF).toString(36).padStart(7, '0');
  return `order_${Number(nowValue).toString(36)}_${random}`;
}

function normalizeDraftItem(raw = {}) {
  const cartItemId = String(raw.cartItemId || '').trim();
  const dishId = String(raw.dishId || '').trim();
  const name = String(raw.name || '').trim();
  const type = raw.type;
  const quantity = Number(raw.quantity);
  if (!cartItemId || !dishId || !name || !['food', 'drink'].includes(type)) {
    throw draftError('INVALID_CART_ITEM', '点菜单中存在信息不完整的项目');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw draftError('INVALID_QUANTITY', `${name}的数量无效`);
  }
  const selectedOptions = canonicalizeSelectedOptions(type, raw.selectedOptions || {});
  const unitPrice = normalizeUnitPrice(raw.unitPrice);
  return {
    cartItemId,
    dishId,
    name,
    type,
    cover: String(raw.cover || '').trim(),
    unitPrice,
    quantity,
    selectedOptions,
    summaryText: buildSummaryText(type, selectedOptions),
  };
}

function buildOrderDraft({
  cart = [],
  orderNote = '',
  requestId = '',
  now = Date.now(),
} = {}) {
  if (!Array.isArray(cart) || cart.length === 0) throw draftError('EMPTY_CART', '点菜单为空');
  const note = String(orderNote || '').trim();
  if (note.length > MAX_ORDER_NOTE_LENGTH) {
    throw draftError('ORDER_NOTE_TOO_LONG', `整单备注不能超过 ${MAX_ORDER_NOTE_LENGTH} 字`);
  }
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId) throw draftError('MISSING_REQUEST_ID', '订单草稿缺少 requestId');
  const items = cart.map(normalizeDraftItem);
  return {
    items,
    itemCount: getItemCount(items),
    displayTotalAmount: roundMoney(getTotalAmount(items)),
    orderNote: note,
    clientCreatedAt: Number(now),
    requestId: safeRequestId,
  };
}

function includesAll(supported, selected) {
  return selected.every(item => supported.includes(item));
}

function drinkOptionsStillValid(dish, rawOptions) {
  const supported = getSupportedDrinkOptions(dish);
  const selected = canonicalizeSelectedOptions('drink', rawOptions);
  const singleFields = ['cupSize', 'sugarLevel', 'temperature', 'sweetener'];
  const singleValid = singleFields.every(field => {
    const values = supported[field];
    return values.length > 0 ? values.includes(selected[field]) : selected[field] === '';
  });
  return singleValid && includesAll(supported.toppings, selected.toppings);
}

function foodOptionsStillValid(dish, rawOptions) {
  const supported = getSupportedFoodOptions(dish);
  const selected = canonicalizeSelectedOptions('food', rawOptions);
  const tasteValid = supported.tastePreferences.length > 0
    ? supported.tastePreferences.includes(selected.tastePreference)
    : selected.tastePreference === '';
  return tasteValid && includesAll(supported.customRequests, selected.customRequests);
}

function validateCartAgainstDishes(cart = [], dishes = []) {
  const lookup = new Map((Array.isArray(dishes) ? dishes : []).map(dish => [dish.id || dish._id, dish]));
  const issues = [];
  (Array.isArray(cart) ? cart : []).forEach(raw => {
    const dish = lookup.get(raw.dishId);
    const name = String(raw.name || '菜品');
    const base = { cartItemId: raw.cartItemId || '', dishId: raw.dishId || '' };
    if (!dish) {
      issues.push({ ...base, code: 'DISH_DISABLED', message: `${name}已下架，请重新确认点菜单` });
      return;
    }
    const restriction = getDishRestriction(dish);
    if (restriction) {
      issues.push({ ...base, code: `DISH_${restriction.key}`, message: `${name}${restriction.text}，请重新确认点菜单` });
      return;
    }
    if (dish.type !== raw.type) {
      issues.push({ ...base, code: 'DISH_TYPE_CHANGED', message: `${name}的类型已发生变化，请重新选择` });
      return;
    }
    const optionsValid = raw.type === 'drink'
      ? drinkOptionsStillValid(dish, raw.selectedOptions)
      : foodOptionsStillValid(dish, raw.selectedOptions);
    if (!optionsValid) {
      issues.push({ ...base, code: 'DISH_OPTIONS_CHANGED', message: `${name}的部分规格已发生变化，请重新选择` });
      return;
    }
    if (normalizeUnitPrice(dish.price) !== normalizeUnitPrice(raw.unitPrice)) {
      issues.push({ ...base, code: 'DISH_PRICE_CHANGED', message: `${name}的价格已发生变化，请重新加入点菜单` });
    }
  });
  return { valid: issues.length === 0, issues };
}

module.exports = {
  MAX_ORDER_NOTE_LENGTH,
  buildOrderDraft,
  createRequestId,
  drinkOptionsStillValid,
  foodOptionsStillValid,
  normalizeDraftItem,
  validateCartAgainstDishes,
};
