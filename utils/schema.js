const DEFAULT_COVER = '/images/default-dish.png';
const { normalizeSugarLevels } = require('../config/drink-options');
const { normalizeMealRoles } = require('../config/meal-roles');
const VALID_DISH_TYPES = ['food', 'drink'];
const VALID_CATEGORY_TYPES = ['food', 'drink', 'all'];
const VALID_SPICY_LEVELS = ['none', 'mild', 'medium', 'hot'];

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function assertCloudImageReference(value, fieldName) {
  if (!value) return;
  if (!isCloudFileID(value)) {
    const error = new Error(`${fieldName} 必须是云存储 fileID`);
    error.code = 'INVALID_IMAGE_FILE_ID';
    throw error;
  }
}

function legacyCategoryId(name) {
  const safeName = cleanString(name, 50) || '未分类';
  return `legacy:${encodeURIComponent(safeName)}`;
}

function normalizeBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === false) return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return defaultValue;
}

function normalizeStringArray(value, maxItems = 30, maxLength = 50) {
  const values = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[\n,，]/) : []);
  return values
    .map(item => cleanString(item, maxLength))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, maxItems);
}

function fallbackItemId(prefix, index) {
  return `${prefix}_legacy_${index + 1}`;
}

function parseLegacyIngredient(value) {
  const text = cleanString(value, 300);
  const match = text.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*[^\s]*|适量|少许|若干)$/);
  return match
    ? { name: cleanString(match[1], 100), amount: cleanString(match[2], 50) }
    : { name: cleanString(text, 100), amount: '' };
}

function normalizeIngredients(value) {
  const values = typeof value === 'string'
    ? value.split('\n').map(item => item.trim()).filter(Boolean)
    : (Array.isArray(value) ? value : []);
  return values.slice(0, 100).map(item => {
    if (typeof item === 'string') {
      return { ...parseLegacyIngredient(item), note: '' };
    }
    const amount = cleanString(item && item.amount, 50);
    const unit = cleanString(item && item.unit, 20);
    return {
      id: cleanString(item && item.id, 100),
      name: cleanString(item && item.name, 100),
      amount: unit && !amount.endsWith(unit) ? `${amount}${unit}` : (amount || unit),
      note: cleanString(item && item.note, 300),
    };
  }).filter(item => item.name).map((item, index) => ({
    ...item,
    id: item.id || fallbackItemId('ingredient', index),
  }));
}

function normalizeSteps(value) {
  const values = typeof value === 'string'
    ? value.split('\n').map(item => item.trim()).filter(Boolean)
    : (Array.isArray(value) ? value : []);
  return values.slice(0, 100).map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: '',
        title: '',
        description: cleanString(item.replace(/^\s*\d+[.、]\s*/, ''), 1000),
        image: '',
      };
    }
    return {
      id: cleanString(item && item.id, 100),
      title: cleanString(item && item.title, 100),
      description: cleanString(item && item.description, 1000),
      image: cleanString(item && item.image, 1000),
    };
  }).filter(item => item.description).map((item, index) => ({
    ...item,
    id: item.id || fallbackItemId('step', index),
    stepNumber: index + 1,
  }));
}

function normalizeEstimatedTime(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.max(0, value)}分钟`;
  const text = cleanString(value, 50);
  if (/^\d+(?:\.\d+)?$/.test(text)) return `${text}分钟`;
  return text;
}

function normalizeServingSize(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.max(0, value)}人`;
  const text = cleanString(value, 50);
  if (/^\d+(?:\s*[-~至]\s*\d+)?$/.test(text)) return `${text.replace(/\s/g, '')}人`;
  return text;
}

function normalizeSpicyLevel(value) {
  if (VALID_SPICY_LEVELS.includes(value)) return value;
  const text = cleanString(value, 20).toLowerCase();
  const aliases = {
    '不辣': 'none',
    '无辣': 'none',
    '微辣': 'mild',
    '中辣': 'medium',
    '辣': 'medium',
    '重辣': 'hot',
    '特辣': 'hot',
  };
  if (aliases[text]) return aliases[text];
  if (text !== '' && Number.isFinite(Number(text))) {
    const level = Number(text);
    if (level <= 0) return 'none';
    if (level <= 2) return 'mild';
    if (level <= 4) return 'medium';
    return 'hot';
  }
  return 'none';
}

function normalizePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeSort(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferDishType(raw) {
  if (raw && VALID_DISH_TYPES.includes(raw.type)) return raw.type;
  const categoryName = cleanString(raw && (raw.categoryName || raw.category), 50);
  return categoryName.includes('饮品') || categoryName.includes('饮料') ? 'drink' : 'food';
}

function normalizeDish(raw = {}) {
  const type = inferDishType(raw);
  const categoryName = cleanString(raw.categoryName || raw.category, 50) || '未分类';
  const cover = cleanString(raw.cover || raw.image || DEFAULT_COVER, 1000);
  const recommended = raw.recommended !== undefined
    ? normalizeBoolean(raw.recommended, false)
    : normalizeBoolean(raw.isPopular, false);
  const ingredientSource = Array.isArray(raw.ingredients) && raw.ingredients.length > 0
    ? raw.ingredients
    : (typeof raw.ingredients === 'string' && raw.ingredients.trim()
      ? raw.ingredients
      : (raw.legacyIngredients || raw.ingredients));
  const stepSource = Array.isArray(raw.steps) && raw.steps.length > 0
    ? raw.steps
    : (typeof raw.steps === 'string' && raw.steps.trim()
      ? raw.steps
      : (raw.legacySteps || raw.steps));
  const ingredients = normalizeIngredients(ingredientSource);
  const steps = normalizeSteps(stepSource);
  const legacyIceLevels = type === 'drink'
    ? normalizeStringArray(raw.availableIceLevels, 20, 30)
    : [];
  const explicitTemperatures = type === 'drink'
    ? normalizeStringArray(raw.availableTemperatures, 20, 30)
    : [];
  const availableTemperatures = type === 'drink'
    ? (explicitTemperatures.length > 0 ? explicitTemperatures : legacyIceLevels)
    : [];
  return {
    ...raw,
    id: raw.id || raw._id || '',
    name: cleanString(raw.name, 100),
    type,
    categoryId: cleanString(raw.categoryId, 100) || legacyCategoryId(categoryName),
    categoryName,
    category: categoryName,
    cover,
    image: cover,
    images: normalizeStringArray(raw.images, 20, 1000),
    description: cleanString(raw.description, 1000),
    tags: normalizeStringArray(raw.tags, 30, 50),
    price: normalizePrice(raw.price),
    estimatedTime: normalizeEstimatedTime(raw.estimatedTime),
    servingSize: normalizeServingSize(raw.servingSize),
    spicyLevel: normalizeSpicyLevel(raw.spicyLevel),
    ingredients,
    ingredientsText: typeof ingredientSource === 'string'
      ? ingredientSource
      : ingredients.map(item => [item.name, item.amount].filter(Boolean).join(' ')).join('\n'),
    steps,
    stepsText: typeof stepSource === 'string'
      ? stepSource
      : steps.map(item => `${item.stepNumber}. ${item.description || item.title}`).join('\n'),
    tips: cleanString(raw.tips, 2000),
    recommended,
    isPopular: recommended,
    signature: normalizeBoolean(raw.signature, false),
    availableToday: normalizeBoolean(raw.availableToday, raw.status !== 'unavailable'),
    soldOut: normalizeBoolean(raw.soldOut, false),
    enabled: normalizeBoolean(raw.enabled, true),
    sort: normalizeSort(raw.sort),
    availableCupSizes: type === 'drink'
      ? normalizeStringArray(raw.availableCupSizes, 20, 50)
      : [],
    availableSugarLevels: type === 'drink'
      ? normalizeSugarLevels(raw.availableSugarLevels, 20)
      : [],
    availableIceLevels: type === 'drink'
      ? legacyIceLevels
      : [],
    availableTemperatures,
    availableSweetenerTypes: type === 'drink'
      ? normalizeStringArray(raw.availableSweetenerTypes, 20, 30)
      : [],
    availableToppings: type === 'drink'
      ? normalizeStringArray(raw.availableToppings, 100, 50)
      : [],
    availableTastePreferences: type === 'food'
      ? normalizeStringArray(raw.availableTastePreferences, 30, 50)
      : [],
    availableCustomRequests: type === 'food'
      ? normalizeStringArray(raw.availableCustomRequests, 100, 50)
      : [],
    mealRoles: normalizeMealRoles(raw.mealRoles, type),
    schemaVersion: Number(raw.schemaVersion) || 1,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function normalizeCategory(raw = {}) {
  const name = cleanString(raw.name || raw.category, 50) || '未分类';
  let type = raw.type || raw.itemType;
  if (!VALID_CATEGORY_TYPES.includes(type)) {
    if (/饮品|饮料|咖啡|茶|果汁|奶昔/.test(name)) type = 'drink';
    else if (/菜|汤|饭|面|粥|肉|素|主食|小吃|甜品|甜点|早餐|夜宵/.test(name)) type = 'food';
    else type = 'all';
  }
  return {
    ...raw,
    id: raw.id || raw._id || legacyCategoryId(name),
    name,
    icon: cleanString(raw.icon, 1000),
    type,
    enabled: normalizeBoolean(raw.enabled, true),
    sort: normalizeSort(raw.sort),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function prepareCategoryWritePayload(raw = {}) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(raw, 'name')) payload.name = cleanString(raw.name, 50);
  if (Object.prototype.hasOwnProperty.call(raw, 'type')) payload.type = raw.type;
  if (Object.prototype.hasOwnProperty.call(raw, 'icon')) payload.icon = cleanString(raw.icon, 1000);
  if (Object.prototype.hasOwnProperty.call(raw, 'sort')) payload.sort = raw.sort;
  if (Object.prototype.hasOwnProperty.call(raw, 'enabled')) payload.enabled = raw.enabled !== false;
  return payload;
}

function categoriesFromDishes(dishes) {
  const byId = {};
  (dishes || []).map(normalizeDish).forEach(dish => {
    if (!byId[dish.categoryId]) {
      byId[dish.categoryId] = normalizeCategory({
        id: dish.categoryId,
        name: dish.categoryName,
        type: dish.type,
        enabled: true,
        sort: 9999,
      });
    }
  });
  return Object.keys(byId).map(id => byId[id]).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'));
}

function prepareDishWritePayload(raw = {}) {
  const payload = { ...raw };
  // availableIceLevels 仅用于旧数据读取兼容；所有新写入统一使用 availableTemperatures。
  delete payload.availableIceLevels;
  if (Object.prototype.hasOwnProperty.call(raw, 'images')) payload.images = normalizeStringArray(raw.images, 20, 1000);
  if (Object.prototype.hasOwnProperty.call(raw, 'tags')) payload.tags = normalizeStringArray(raw.tags, 30, 50);
  if (Object.prototype.hasOwnProperty.call(raw, 'ingredients')) payload.ingredients = normalizeIngredients(raw.ingredients);
  if (Object.prototype.hasOwnProperty.call(raw, 'steps')) payload.steps = normalizeSteps(raw.steps);
  if (Object.prototype.hasOwnProperty.call(raw, 'availableCupSizes')) {
    payload.availableCupSizes = normalizeStringArray(raw.availableCupSizes, 20, 50);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'availableSugarLevels')) {
    payload.availableSugarLevels = normalizeSugarLevels(raw.availableSugarLevels, 20);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'availableTemperatures')) {
    payload.availableTemperatures = normalizeStringArray(raw.availableTemperatures, 20, 30);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'availableSweetenerTypes')) {
    payload.availableSweetenerTypes = normalizeStringArray(raw.availableSweetenerTypes, 20, 30);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'availableToppings')) {
    payload.availableToppings = normalizeStringArray(raw.availableToppings, 100, 50);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'mealRoles') || Object.prototype.hasOwnProperty.call(raw, 'type')) {
    payload.mealRoles = normalizeMealRoles(raw.mealRoles, raw.type, { strict: true });
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'estimatedTime')) {
    payload.estimatedTime = normalizeEstimatedTime(raw.estimatedTime);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'servingSize')) {
    payload.servingSize = normalizeServingSize(raw.servingSize);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'spicyLevel')) {
    payload.spicyLevel = normalizeSpicyLevel(raw.spicyLevel);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'cover')) {
    assertCloudImageReference(payload.cover, 'cover');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'image')) {
    assertCloudImageReference(payload.image, 'image');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'images')) {
    payload.images.forEach(image => assertCloudImageReference(image, 'images'));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'steps')) {
    payload.steps.forEach(step => assertCloudImageReference(step.image, 'steps.image'));
  }
  return payload;
}

module.exports = {
  DEFAULT_COVER,
  VALID_CATEGORY_TYPES,
  VALID_DISH_TYPES,
  VALID_SPICY_LEVELS,
  categoriesFromDishes,
  cleanString,
  isCloudFileID,
  legacyCategoryId,
  normalizeCategory,
  normalizeDish,
  normalizeEstimatedTime,
  normalizeIngredients,
  normalizeServingSize,
  normalizeSpicyLevel,
  normalizeSteps,
  normalizeStringArray,
  prepareCategoryWritePayload,
  prepareDishWritePayload,
};
