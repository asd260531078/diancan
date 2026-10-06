const crypto = require('crypto');

const MAX_ORDER_ITEMS = 50;
const MAX_ORDER_NOTE_LENGTH = 200;
const MAX_QUANTITY = 99;
const MAX_SELECTED_ARRAY_ITEMS = 30;
const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'completed', 'cancelled'];
const ORDER_STATUS_TEXT = {
  pending: '待确认',
  confirmed: '已确认',
  preparing: '制作中',
  completed: '已完成',
  cancelled: '已取消',
};
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const LEGACY_SUGAR_LEVEL_MAP = {
  正常糖: '正常甜',
  七分糖: '七分甜',
  少糖: '少甜',
  半糖: '半甜',
  三分糖: '三分甜',
  微糖: '微甜',
  无糖: '不另外加糖',
};

function orderError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.isAppError = true;
  return error;
}

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizeStringArray(value, maxItems = 100, maxLength = 80, fieldName = '选项') {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw orderError('INVALID_OPTIONS', `${fieldName}必须是数组`);
  if (value.length > maxItems) {
    throw orderError('TOO_MANY_OPTIONS', `${fieldName}最多选择 ${maxItems} 项`);
  }
  if (value.some(item => typeof item !== 'string')) {
    throw orderError('INVALID_OPTIONS', `${fieldName}只能包含文本`);
  }
  return value
    .map(item => cleanString(item, maxLength))
    .filter(Boolean)
    .filter((item, index, values) => values.indexOf(item) === index)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .slice(0, maxItems);
}

function normalizeSupportedList(value, maxItems = 100) {
  return (Array.isArray(value) ? value : [])
    .map(item => cleanString(item, 80))
    .filter(Boolean)
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, maxItems);
}

function normalizeSugarLevel(value) {
  const cleaned = cleanString(value, 30);
  return LEGACY_SUGAR_LEVEL_MAP[cleaned] || cleaned;
}

function normalizeSupportedSugarLevels(value) {
  return normalizeSupportedList(value, 20)
    .map(normalizeSugarLevel)
    .filter((item, index, values) => values.indexOf(item) === index);
}

function assertKnownOptionKeys(raw, allowedKeys) {
  const options = raw === undefined || raw === null ? {} : raw;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw orderError('INVALID_OPTIONS', 'selectedOptions 必须是对象');
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw orderError('INVALID_OPTIONS', 'selectedOptions 必须是普通对象');
  }
  const unknown = Object.keys(options).filter(key => !allowedKeys.includes(key));
  if (unknown.length) throw orderError('INVALID_OPTIONS', `存在不支持的规格字段：${unknown[0]}`);
  return options;
}

function readOptionalString(raw, key, maxLength = 80) {
  if (raw[key] === undefined || raw[key] === null) return '';
  if (typeof raw[key] !== 'string') throw orderError('INVALID_OPTIONS', `${key} 必须是文本`);
  const value = raw[key].trim();
  if (value.length > maxLength) throw orderError('INVALID_OPTIONS', `${key} 不能超过 ${maxLength} 个字符`);
  return value;
}

function canonicalizeDrinkOptions(raw = {}) {
  const options = assertKnownOptionKeys(raw, [
    'cupSize', 'sugarLevel', 'temperature', 'sweetener', 'toppings',
  ]);
  return {
    cupSize: readOptionalString(options, 'cupSize'),
    sugarLevel: normalizeSugarLevel(readOptionalString(options, 'sugarLevel')),
    temperature: readOptionalString(options, 'temperature'),
    sweetener: readOptionalString(options, 'sweetener'),
    toppings: normalizeStringArray(options.toppings, MAX_SELECTED_ARRAY_ITEMS, 80, 'toppings'),
  };
}

function canonicalizeFoodOptions(raw = {}) {
  const options = assertKnownOptionKeys(raw, ['tastePreference', 'customRequests']);
  return {
    tastePreference: readOptionalString(options, 'tastePreference'),
    customRequests: normalizeStringArray(options.customRequests, MAX_SELECTED_ARRAY_ITEMS, 80, 'customRequests'),
  };
}

function buildSummaryText(type, selectedOptions = {}) {
  if (type === 'drink') {
    const options = canonicalizeDrinkOptions(selectedOptions);
    return [
      options.cupSize,
      options.sugarLevel,
      options.temperature,
      options.sweetener,
      ...options.toppings,
    ].filter(Boolean).join(' / ');
  }
  if (type === 'food') {
    const options = canonicalizeFoodOptions(selectedOptions);
    return [options.tastePreference, ...options.customRequests].filter(Boolean).join(' / ');
  }
  throw orderError('INVALID_DISH_TYPE', '商品类型必须是 food 或 drink');
}

function assertSingleOption(dishName, label, selected, supported) {
  if (supported.length > 0 && !supported.includes(selected)) {
    throw orderError('DISH_OPTIONS_CHANGED', `${dishName}的${label}已变化，请重新选择`);
  }
  if (supported.length === 0 && selected) {
    throw orderError('INVALID_OPTIONS', `${dishName}不支持所选${label}`);
  }
}

function validateDrinkOptions(dish, rawOptions) {
  const selected = canonicalizeDrinkOptions(rawOptions);
  const temperatures = normalizeSupportedList(
    Array.isArray(dish.availableTemperatures) && dish.availableTemperatures.length > 0
      ? dish.availableTemperatures
      : dish.availableIceLevels,
    20,
  );
  const supported = {
    cupSize: normalizeSupportedList(dish.availableCupSizes, 20),
    sugarLevel: normalizeSupportedSugarLevels(dish.availableSugarLevels),
    temperature: temperatures,
    sweetener: normalizeSupportedList(dish.availableSweetenerTypes, 20),
    toppings: normalizeSupportedList(dish.availableToppings, 100),
  };
  assertSingleOption(dish.name, '杯型', selected.cupSize, supported.cupSize);
  assertSingleOption(dish.name, '甜度', selected.sugarLevel, supported.sugarLevel);
  assertSingleOption(dish.name, '温度', selected.temperature, supported.temperature);
  assertSingleOption(dish.name, '甜味来源', selected.sweetener, supported.sweetener);
  const invalidTopping = selected.toppings.find(item => !supported.toppings.includes(item));
  if (invalidTopping) {
    throw orderError('DISH_OPTIONS_CHANGED', `${dish.name}不再支持小料“${invalidTopping}”，请重新选择`);
  }
  return selected;
}

function validateFoodOptions(dish, rawOptions) {
  const selected = canonicalizeFoodOptions(rawOptions);
  const tastes = normalizeSupportedList(dish.availableTastePreferences, 30);
  const requests = normalizeSupportedList(dish.availableCustomRequests, 100);
  assertSingleOption(dish.name, '口味', selected.tastePreference, tastes);
  const invalidRequest = selected.customRequests.find(item => !requests.includes(item));
  if (invalidRequest) {
    throw orderError('DISH_OPTIONS_CHANGED', `${dish.name}不支持要求“${invalidRequest}”，请重新选择`);
  }
  return selected;
}

function validateSelectedOptions(dish, rawOptions) {
  if (dish.type === 'drink') return validateDrinkOptions(dish, rawOptions);
  if (dish.type === 'food') return validateFoodOptions(dish, rawOptions);
  throw orderError('INVALID_DISH_TYPE', `${dish.name || '商品'}类型无效`);
}

function assertDishOrderable(dish, category) {
  const name = cleanString(dish && dish.name, 100) || '商品';
  if (!dish) throw orderError('DISH_NOT_FOUND', '点菜单中有商品已不存在，请重新确认');
  if (dish.enabled === false) throw orderError('DISH_DISABLED', `${name}已下架，请重新确认点菜单`);
  if (dish.soldOut === true) throw orderError('DISH_SOLD_OUT', `${name}已售罄，请重新确认点菜单`);
  if (dish.availableToday === false) throw orderError('DISH_UNAVAILABLE_TODAY', `${name}今天不做，请重新确认点菜单`);
  if (!category || category.enabled === false) {
    throw orderError('CATEGORY_DISABLED', `${name}所属分类已停用，请重新确认点菜单`);
  }
  return true;
}

function normalizeUnitPrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 999999) {
    throw orderError('DISH_PRICE_INVALID', '商品价格异常，请联系管理员');
  }
  return Math.round(number * 100) / 100;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeCreateOrderInput(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw orderError('INVALID_ORDER_INPUT', '订单数据必须是对象');
  }
  if (typeof raw.requestId !== 'string') {
    throw orderError('INVALID_REQUEST_ID', '订单 requestId 必须是文本');
  }
  if (raw.requestId.trim().length > 120) {
    throw orderError('INVALID_REQUEST_ID', '订单 requestId 不能超过 120 个字符');
  }
  const requestId = raw.requestId.trim();
  if (!requestId || !/^[a-zA-Z0-9_-]+$/.test(requestId)) {
    throw orderError('INVALID_REQUEST_ID', '订单 requestId 无效，请返回后重试');
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw orderError('EMPTY_CART', '点菜单为空');
  }
  if (raw.items.length > MAX_ORDER_ITEMS) {
    throw orderError('TOO_MANY_ITEMS', `一次最多提交 ${MAX_ORDER_ITEMS} 个点菜单项目`);
  }
  if (raw.orderNote !== undefined && raw.orderNote !== null && typeof raw.orderNote !== 'string') {
    throw orderError('INVALID_ORDER_NOTE', '整单备注必须是文本');
  }
  const orderNote = String(raw.orderNote || '').trim();
  if (orderNote.length > MAX_ORDER_NOTE_LENGTH) {
    throw orderError('ORDER_NOTE_TOO_LONG', `整单备注不能超过 ${MAX_ORDER_NOTE_LENGTH} 字`);
  }
  const items = raw.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw orderError('INVALID_ORDER_ITEM', `第 ${index + 1} 个商品数据无效`);
    }
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) {
      throw orderError('INVALID_ORDER_ITEM', `第 ${index + 1} 个商品必须是普通对象`);
    }
    if (typeof item.dishId !== 'string' || item.dishId.trim().length > 100) {
      throw orderError('INVALID_ORDER_ITEM', `第 ${index + 1} 个商品 dishId 无效`);
    }
    const dishId = item.dishId.trim();
    if (!dishId) throw orderError('INVALID_ORDER_ITEM', `第 ${index + 1} 个商品缺少 dishId`);
    if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity)
        || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw orderError('INVALID_QUANTITY', `第 ${index + 1} 个商品数量必须是 1～${MAX_QUANTITY} 的整数`);
    }
    const selectedOptions = item.selectedOptions === undefined ? {} : item.selectedOptions;
    if (!selectedOptions || typeof selectedOptions !== 'object' || Array.isArray(selectedOptions)) {
      throw orderError('INVALID_OPTIONS', `第 ${index + 1} 个商品规格无效`);
    }
    return { dishId, quantity: item.quantity, selectedOptions };
  });
  return { requestId, items, orderNote };
}

function normalizePageLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 20;
  return Math.max(1, Math.min(20, parsed));
}

function normalizePageOffset(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 0;
  return Math.max(0, Math.min(10000, parsed));
}

function buildOrderItem(dish, intentItem) {
  const selectedOptions = validateSelectedOptions(dish, intentItem.selectedOptions);
  const unitPrice = normalizeUnitPrice(dish.price);
  const lineAmount = unitPrice === null
    ? null
    : roundMoney(unitPrice * intentItem.quantity);
  // 订单里的菜品图只显示成小图：有与当前主图匹配的缩略图时用缩略图。
  const listCover = dish.coverThumb && dish.coverThumbOf === dish.cover ? dish.coverThumb : dish.cover;
  const cover = typeof listCover === 'string' && listCover.startsWith('cloud://')
    ? listCover
    : '';
  return {
    dishId: cleanString(dish.id || dish._id, 100),
    name: cleanString(dish.name, 100),
    type: dish.type,
    cover,
    categoryId: cleanString(dish.categoryId, 100),
    unitPrice,
    quantity: intentItem.quantity,
    lineAmount,
    selectedOptions,
    summaryText: buildSummaryText(dish.type, selectedOptions),
  };
}

function buildOrderTotals(items = []) {
  let totalCents = 0;
  let itemCount = 0;
  let hasUnpricedItems = false;
  items.forEach(item => {
    itemCount += item.quantity;
    if (item.lineAmount === null) {
      hasUnpricedItems = true;
    } else {
      totalCents += Math.round(item.lineAmount * 100);
    }
  });
  return { itemCount, totalAmount: totalCents / 100, hasUnpricedItems };
}

function buildOrderMergeKey(item) {
  return `${item.dishId}::${item.type}::${JSON.stringify(item.selectedOptions)}`;
}

function mergeEquivalentOrderItems(items = []) {
  const merged = new Map();
  items.forEach(item => {
    const key = buildOrderMergeKey(item);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      return;
    }
    const quantity = existing.quantity + item.quantity;
    if (quantity > MAX_QUANTITY) {
      throw orderError('INVALID_QUANTITY', `${item.name}相同规格合计不能超过 ${MAX_QUANTITY} 份`);
    }
    merged.set(key, {
      ...existing,
      quantity,
      lineAmount: existing.unitPrice === null
        ? null
        : roundMoney(existing.unitPrice * quantity),
    });
  });
  return [...merged.values()].map((item, index) => ({
    ...item,
    orderItemId: `item_${index + 1}`,
  }));
}

function assertOrderOwner(order, openid, message = '无权访问此订单') {
  if (!order || !openid || order.userOpenId !== openid) {
    throw orderError('FORBIDDEN', message);
  }
  return true;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function buildOrderDocumentId(openid, requestId) {
  return `ord_${stableHash(`${openid}:${requestId}`).slice(0, 28)}`;
}

function formatDatePart(nowValue = Date.now()) {
  const date = new Date(Number(nowValue) + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function generateOrderNo(openid, requestId, nowValue = Date.now()) {
  const suffix = stableHash(`${openid}:${requestId}`).slice(0, 6).toUpperCase();
  return `XG${formatDatePart(nowValue)}-${suffix}`;
}

function validateStatusTransition(currentStatus, nextStatus) {
  if (!VALID_ORDER_STATUSES.includes(currentStatus) || !VALID_ORDER_STATUSES.includes(nextStatus)) {
    throw orderError('INVALID_ORDER_STATUS', '订单状态无效');
  }
  if (!STATUS_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw orderError(
      'INVALID_STATUS_TRANSITION',
      `订单不能从“${ORDER_STATUS_TEXT[currentStatus]}”变更为“${ORDER_STATUS_TEXT[nextStatus]}”`,
    );
  }
  return true;
}

module.exports = {
  LEGACY_SUGAR_LEVEL_MAP,
  MAX_ORDER_ITEMS,
  MAX_ORDER_NOTE_LENGTH,
  MAX_QUANTITY,
  MAX_SELECTED_ARRAY_ITEMS,
  ORDER_STATUS_TEXT,
  STATUS_TRANSITIONS,
  VALID_ORDER_STATUSES,
  assertDishOrderable,
  assertOrderOwner,
  buildOrderDocumentId,
  buildOrderItem,
  buildOrderMergeKey,
  buildOrderTotals,
  buildSummaryText,
  canonicalizeDrinkOptions,
  canonicalizeFoodOptions,
  generateOrderNo,
  mergeEquivalentOrderItems,
  normalizeCreateOrderInput,
  normalizePageLimit,
  normalizePageOffset,
  normalizeUnitPrice,
  validateDrinkOptions,
  validateFoodOptions,
  validateSelectedOptions,
  validateStatusTransition,
};
