const imageService = require('../services/image');
const { normalizeSugarLevels } = require('../config/drink-options');
const { DEFAULT_COVER } = require('./schema');

const SPICY_TEXT = {
  mild: '🌶 微辣',
  medium: '🌶🌶 中辣',
  hot: '🌶🌶🌶 辣',
};

const SPICY_LABEL = {
  mild: '微辣',
  medium: '中辣',
  hot: '辣',
};

function normalizedOptionValues(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function buildDrinkSpecRows(dish = {}) {
  if (dish.type !== 'drink') return [];
  const currentTemperatures = normalizedOptionValues(dish.availableTemperatures);
  const temperatures = currentTemperatures.length > 0
    ? currentTemperatures
    : normalizedOptionValues(dish.availableIceLevels);
  return [
    { key: 'cupSize', label: '可选杯型', values: normalizedOptionValues(dish.availableCupSizes) },
    { key: 'sugar', label: '可选甜度', values: normalizeSugarLevels(dish.availableSugarLevels) },
    { key: 'temperature', label: '可选温度', values: temperatures },
    { key: 'sweetener', label: '甜味来源', values: normalizedOptionValues(dish.availableSweetenerTypes) },
    { key: 'topping', label: '可选小料', values: normalizedOptionValues(dish.availableToppings) },
  ].filter(item => item.values.length > 0);
}

function safeDetailImage(value, fieldName, dishId, warn = console.warn) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (image.startsWith('/images/') || image.startsWith('https://') || imageService.isCloudFileID(image)) return image;
  warn(`忽略非法${fieldName}`, { dishId, image });
  return '';
}

function decorateDetailDish(dish = {}, warn = console.warn) {
  const dishId = dish.id || '';
  const cover = safeDetailImage(dish.cover || dish.image, '菜品图片', dishId, warn) || DEFAULT_COVER;
  const steps = (Array.isArray(dish.steps) ? dish.steps : []).map(step => ({
    ...step,
    image: safeDetailImage(step && step.image, '步骤图片', dishId, warn),
  }));
  return {
    ...dish,
    cover,
    image: cover,
    tags: Array.isArray(dish.tags) ? dish.tags : [],
    ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
    steps,
    tips: dish.tips || '',
    availableCupSizes: normalizedOptionValues(dish.availableCupSizes),
    availableSugarLevels: normalizeSugarLevels(dish.availableSugarLevels),
    availableTemperatures: normalizedOptionValues(dish.availableTemperatures),
    availableIceLevels: normalizedOptionValues(dish.availableIceLevels),
    availableSweetenerTypes: normalizedOptionValues(dish.availableSweetenerTypes),
    availableToppings: normalizedOptionValues(dish.availableToppings),
  };
}

module.exports = {
  DEFAULT_COVER,
  SPICY_LABEL,
  SPICY_TEXT,
  buildDrinkSpecRows,
  decorateDetailDish,
  normalizedOptionValues,
  safeDetailImage,
};
