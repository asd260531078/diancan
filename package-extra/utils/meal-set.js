const { DEFAULT_COVER, normalizeCategory, normalizeDish } = require('../../utils/schema');
const { getDishRestriction } = require('../../utils/dish-status');
const { normalizeUnitPrice } = require('../../utils/cart');
const { formatMoney } = require('../../utils/money');
const { listCover } = require('../../utils/detail-presentation');

const MAX_MEAL_SET_ITEMS = 20;
const MAX_MEAL_SET_QUANTITY = 99;
const MAX_MEAL_SET_TAGS = 10;

function cleanText(value, maxLength) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, maxLength);
}

function normalizeMealSetItems(value = []) {
  const source = Array.isArray(value) ? value : [];
  const result = [];
  const byDishId = new Map();
  source.slice(0, MAX_MEAL_SET_ITEMS).forEach(item => {
    const dishId = cleanText(item && item.dishId, 100);
    const quantity = Math.floor(Number(item && item.quantity));
    if (!dishId || !Number.isInteger(quantity) || quantity < 1) return;
    if (byDishId.has(dishId)) {
      const existing = byDishId.get(dishId);
      existing.quantity = Math.min(MAX_MEAL_SET_QUANTITY, existing.quantity + quantity);
      return;
    }
    const normalized = { dishId, quantity: Math.min(MAX_MEAL_SET_QUANTITY, quantity) };
    byDishId.set(dishId, normalized);
    result.push(normalized);
  });
  return result;
}

function normalizeMealSet(raw = {}) {
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  return {
    ...raw,
    id: cleanText(raw.id || raw._id, 100),
    name: cleanText(raw.name, 30),
    description: cleanText(raw.description, 200),
    cover: cleanText(raw.cover, 1000),
    tags: tags
      .map(item => cleanText(item, 20))
      .filter(Boolean)
      .filter((item, index, items) => items.indexOf(item) === index)
      .slice(0, MAX_MEAL_SET_TAGS),
    items: normalizeMealSetItems(raw.items),
    enabled: raw.enabled !== false,
    recommended: raw.recommended === true,
    sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function totalText(amount, hasUnpricedItems) {
  if (hasUnpricedItems && amount <= 0) return '部分商品未标价';
  if (hasUnpricedItems) return `¥${formatMoney(amount)} + 部分商品未标价`;
  return `¥${formatMoney(amount)}`;
}

function decorateMealSet(rawMealSet = {}, rawDishes = [], rawCategories = []) {
  const mealSet = normalizeMealSet(rawMealSet);
  const dishes = (Array.isArray(rawDishes) ? rawDishes : []).map(normalizeDish);
  const categories = (Array.isArray(rawCategories) ? rawCategories : []).map(normalizeCategory);
  const dishById = new Map(dishes.map(dish => [dish.id, dish]));
  const categoryById = new Map(categories.map(category => [category.id, category]));
  let amountCents = 0;
  let hasUnpricedItems = false;
  let itemCount = 0;
  const items = mealSet.items.map(item => {
    itemCount += item.quantity;
    const dish = dishById.get(item.dishId);
    if (!dish) {
      hasUnpricedItems = true;
      return {
        ...item,
        dish: null,
        name: '商品已失效',
        cover: DEFAULT_COVER,
        unitPrice: null,
        lineAmount: null,
        canOrder: false,
        statusKey: 'missing',
        statusText: '商品已失效',
      };
    }
    const restriction = getDishRestriction(dish);
    const category = categoryById.get(dish.categoryId);
    const categoryDisabled = category && category.enabled === false;
    const unitPrice = normalizeUnitPrice(dish.price);
    if (unitPrice === null) hasUnpricedItems = true;
    else amountCents += Math.round(unitPrice * 100) * item.quantity;
    return {
      ...item,
      dish,
      name: dish.name,
      cover: listCover(dish) || DEFAULT_COVER,
      unitPrice,
      lineAmount: unitPrice === null ? null : unitPrice * item.quantity,
      canOrder: !restriction && !categoryDisabled,
      statusKey: restriction ? restriction.key : (categoryDisabled ? 'categoryDisabled' : ''),
      statusText: restriction ? restriction.text : (categoryDisabled ? '当前不可点' : ''),
    };
  });
  const canOrder = items.length > 0 && items.every(item => item.canOrder);
  const displayCover = mealSet.cover || (items.find(item => item.dish) || {}).cover || DEFAULT_COVER;
  const displayTotalAmount = amountCents / 100;
  return {
    ...mealSet,
    cover: displayCover,
    items,
    uniqueItemCount: items.length,
    itemCount,
    canOrder,
    invalidItems: items.filter(item => !item.canOrder),
    hasUnpricedItems,
    displayTotalAmount,
    displayTotalText: totalText(displayTotalAmount, hasUnpricedItems),
    summaryItems: items.slice(0, 5).map(item => `${item.name} ×${item.quantity}`),
  };
}

module.exports = {
  MAX_MEAL_SET_ITEMS,
  MAX_MEAL_SET_QUANTITY,
  MAX_MEAL_SET_TAGS,
  decorateMealSet,
  normalizeMealSet,
  normalizeMealSetItems,
  totalText,
};
