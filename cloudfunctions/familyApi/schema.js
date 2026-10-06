const DEFAULT_COVER = '/images/default-dish.png';
const VALID_DISH_TYPES = ['food', 'drink'];
const VALID_CATEGORY_TYPES = ['food', 'drink', 'all'];
const VALID_SPICY_LEVELS = ['none', 'mild', 'medium', 'hot'];
const VALID_MEAL_ROLES = ['main', 'side', 'staple', 'soup', 'drink', 'dessert'];
const LEGACY_SUGAR_LEVEL_MAP = {
  正常糖: '正常甜',
  七分糖: '七分甜',
  少糖: '少甜',
  半糖: '半甜',
  三分糖: '三分甜',
  微糖: '微甜',
  无糖: '不另外加糖',
};

function schemaError(code, message) {
  const error = new Error(message);
  error.code = code;
  // 校验错误要把具体原因返回给管理员，且发生在写入前，不应更新菜单版本号。
  error.isAppError = true;
  return error;
}

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function assertCloudImageReference(value, fieldName, strict) {
  if (!strict || !value) return;
  if (!isCloudFileID(value)) {
    throw schemaError('INVALID_IMAGE_FILE_ID', `${fieldName} 必须是云存储 fileID`);
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function getDishOrderRestriction(dish = {}) {
  if (dish.enabled === false) return { code: 'DISH_DISABLED', message: '该菜品已下架' };
  if (dish.soldOut === true) return { code: 'DISH_SOLD_OUT', message: '该菜品今日售罄' };
  if (dish.availableToday === false) return { code: 'DISH_UNAVAILABLE_TODAY', message: '该菜品今天不做' };
  return null;
}

function canOrderDish(dish = {}) {
  return dish.enabled !== false
    && dish.availableToday !== false
    && dish.soldOut !== true;
}

function assertDishOrderable(dish = {}) {
  const restriction = getDishOrderRestriction(dish);
  if (restriction) throw schemaError(restriction.code, restriction.message);
  return true;
}

function booleanValue(raw, key, defaultValue, strict) {
  if (!hasOwn(raw, key) || raw[key] === null || raw[key] === '') return defaultValue;
  if (raw[key] === true || raw[key] === false) return raw[key];
  if (!strict) {
    if (raw[key] === 'true' || raw[key] === 1 || raw[key] === '1') return true;
    if (raw[key] === 'false' || raw[key] === 0 || raw[key] === '0') return false;
    return defaultValue;
  }
  throw schemaError('INVALID_FIELD', `${key} 必须是布尔值`);
}

function stringArray(value, maxItems = 30, maxLength = 50, strict = false, fieldName = '字段') {
  if (value === undefined || value === null) return [];
  if (strict && !Array.isArray(value)) throw schemaError('INVALID_FIELD', `${fieldName} 必须是数组`);
  const values = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[\n,，]/) : []);
  if (strict && values.some(item => typeof item !== 'string')) {
    throw schemaError('INVALID_FIELD', `${fieldName} 只能包含文本`);
  }
  if (strict && values.some(item => !item.trim())) {
    throw schemaError('INVALID_FIELD', `${fieldName} 不能包含空文本`);
  }
  return values
    .map(item => cleanString(item, maxLength))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, maxItems);
}

// 杯型允许管理员输入后产生空白项；云端仍校验“必须是字符串数组”，再统一 trim、去空和去重。
function sanitizedStringArray(value, maxItems = 30, maxLength = 50, strict = false, fieldName = '字段') {
  if (value === undefined || value === null) return [];
  if (strict && !Array.isArray(value)) throw schemaError('INVALID_FIELD', `${fieldName} 必须是数组`);
  const values = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[\n,，]/) : []);
  if (strict && values.some(item => typeof item !== 'string')) {
    throw schemaError('INVALID_FIELD', `${fieldName} 只能包含文本`);
  }
  return values
    .map(item => cleanString(item, maxLength))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, maxItems);
}

function sugarLevelArray(value, strict = false) {
  return stringArray(value, 20, 30, strict, 'availableSugarLevels')
    .map(item => LEGACY_SUGAR_LEVEL_MAP[item] || item)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function mealRolesArray(value, type, strict = false) {
  if (value !== undefined && value !== null && strict && !Array.isArray(value)) {
    throw schemaError('INVALID_MEAL_ROLES', 'mealRoles 必须是数组');
  }
  const source = Array.isArray(value) ? value : [];
  if (strict && source.some(item => typeof item !== 'string')) {
    throw schemaError('INVALID_MEAL_ROLES', 'mealRoles 只能包含文本');
  }
  const roles = source
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
  if (strict && roles.some(role => !VALID_MEAL_ROLES.includes(role))) {
    throw schemaError('INVALID_MEAL_ROLES', 'mealRoles 包含未知餐食角色');
  }
  if (type === 'drink') return ['drink'];
  if (strict && roles.includes('drink')) {
    throw schemaError('INVALID_MEAL_ROLES', 'food 不能使用 drink 餐食角色');
  }
  return roles
    .filter(role => VALID_MEAL_ROLES.includes(role) && role !== 'drink')
    .filter((role, index, values) => values.indexOf(role) === index);
}

function imageArray(value, strict = false) {
  if (value === undefined || value === null) return [];
  if (strict && !Array.isArray(value)) throw schemaError('INVALID_FIELD', 'images 必须是数组');
  const values = Array.isArray(value) ? value : [];
  if (strict && values.some(item => typeof item !== 'string')) {
    throw schemaError('INVALID_FIELD', 'images 只能包含文本');
  }
  const images = values
    .map(item => cleanString(item, 1000))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 20);
  images.forEach(image => assertCloudImageReference(image, 'images', strict));
  return images;
}

function generatedItemId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function stableItemId(rawId, prefix, sourceIndex, strict, usedIds) {
  const candidate = cleanString(rawId, 100);
  let id = candidate && !usedIds.has(candidate)
    ? candidate
    : (strict ? generatedItemId(prefix) : `${prefix}_legacy_${sourceIndex + 1}`);
  while (usedIds.has(id)) id = generatedItemId(prefix);
  usedIds.add(id);
  return id;
}

function assertOptionalString(item, key, label, strict) {
  const value = item && item[key];
  if (strict && value !== undefined && value !== null && typeof value !== 'string') {
    throw schemaError('INVALID_FIELD', `${label}必须是文本`);
  }
}

function parseLegacyIngredient(value) {
  const text = cleanString(value, 300);
  const match = text.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*[^\s]*|适量|少许|若干)$/);
  return match
    ? { name: cleanString(match[1], 100), amount: cleanString(match[2], 50) }
    : { name: cleanString(text, 100), amount: '' };
}

function ingredientsArray(value, strict = false) {
  if (value === undefined || value === null) return [];
  if (strict && !Array.isArray(value)) throw schemaError('INVALID_FIELD', 'ingredients 必须是数组');
  const values = typeof value === 'string'
    ? value.split('\n').map(item => item.trim()).filter(Boolean)
    : (Array.isArray(value) ? value : []);
  if (strict && values.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw schemaError('INVALID_FIELD', 'ingredients 每一项必须是对象');
  }
  const usedIds = new Set();
  const result = [];
  values.slice(0, 100).forEach((item, sourceIndex) => {
    if (typeof item === 'string') {
      const parsed = parseLegacyIngredient(item);
      if (!parsed.name) return;
      result.push({
        id: stableItemId('', 'ingredient', sourceIndex, strict, usedIds),
        name: parsed.name,
        amount: parsed.amount,
        note: '',
      });
      return;
    }
    assertOptionalString(item, 'id', 'ingredients.id', strict);
    assertOptionalString(item, 'name', 'ingredients.name', strict);
    assertOptionalString(item, 'amount', 'ingredients.amount', strict);
    assertOptionalString(item, 'unit', 'ingredients.unit', strict);
    assertOptionalString(item, 'note', 'ingredients.note', strict);
    const name = cleanString(item && item.name, 100);
    if (!name) return;
    const amount = cleanString(item && item.amount, 50);
    const unit = cleanString(item && item.unit, 20);
    result.push({
      id: stableItemId(item && item.id, 'ingredient', sourceIndex, strict, usedIds),
      name,
      amount: unit && !amount.endsWith(unit) ? `${amount}${unit}` : (amount || unit),
      note: cleanString(item && item.note, 300),
    });
  });
  return result;
}

function stepsArray(value, strict = false) {
  if (value === undefined || value === null) return [];
  if (strict && !Array.isArray(value)) throw schemaError('INVALID_FIELD', 'steps 必须是数组');
  const values = typeof value === 'string'
    ? value.split('\n').map(item => item.trim()).filter(Boolean)
    : (Array.isArray(value) ? value : []);
  if (strict && values.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw schemaError('INVALID_FIELD', 'steps 每一项必须是对象');
  }
  const usedIds = new Set();
  const result = [];
  values.slice(0, 100).forEach((item, sourceIndex) => {
    if (typeof item === 'string') {
      const description = cleanString(item.replace(/^\s*\d+[.、]\s*/, ''), 1000);
      if (!description) return;
      result.push({
        id: stableItemId('', 'step', sourceIndex, strict, usedIds),
        stepNumber: result.length + 1,
        title: '',
        description,
        image: '',
      });
      return;
    }
    assertOptionalString(item, 'id', 'steps.id', strict);
    assertOptionalString(item, 'title', 'steps.title', strict);
    assertOptionalString(item, 'description', 'steps.description', strict);
    assertOptionalString(item, 'image', 'steps.image', strict);
    const description = cleanString(item && item.description, 1000);
    if (!description) return;
    const image = cleanString(item && item.image, 1000);
    assertCloudImageReference(image, 'steps.image', strict);
    result.push({
      id: stableItemId(item && item.id, 'step', sourceIndex, strict, usedIds),
      stepNumber: result.length + 1,
      title: cleanString(item && item.title, 100),
      description,
      image,
    });
  });
  return result;
}

function priceValue(value, strict = true) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 999999) {
    if (!strict) return null;
    throw schemaError('INVALID_PRICE', '价格格式不正确');
  }
  return Math.round(number * 100) / 100;
}

function sortValue(value, strict = true) {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    if (!strict) return 0;
    throw schemaError('INVALID_SORT', '排序值必须是数字');
  }
  return number;
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
    '不辣': 'none', '无辣': 'none', '微辣': 'mild', '中辣': 'medium',
    '辣': 'medium', '重辣': 'hot', '特辣': 'hot',
  };
  if (aliases[text]) return aliases[text];
  if (text !== '' && Number.isFinite(Number(text))) {
    const number = Number(text);
    if (number <= 0) return 'none';
    if (number <= 2) return 'mild';
    if (number <= 4) return 'medium';
    return 'hot';
  }
  return 'none';
}

function inferDishType(raw) {
  if (raw && VALID_DISH_TYPES.includes(raw.type)) return raw.type;
  const categoryName = cleanString(raw && (raw.categoryName || raw.category), 50);
  return categoryName.includes('饮品') || categoryName.includes('饮料') ? 'drink' : 'food';
}

function dishForWrite(raw = {}, category = {}, options = {}) {
  const strict = options.legacy !== true;
  if (strict && !VALID_DISH_TYPES.includes(raw.type)) {
    throw schemaError('INVALID_DISH_TYPE', 'type 必须是 food 或 drink');
  }
  const type = strict ? raw.type : inferDishType({ ...raw, categoryName: category.name || raw.categoryName || raw.category });
  const name = cleanString(raw.name, 100);
  if (!name) throw schemaError('INVALID_DISH', '菜品名称不能为空');
  const categoryName = cleanString(category.name || raw.categoryName || raw.category, 50);
  const categoryId = cleanString(category.id || category._id || raw.categoryId, 100);
  if (!categoryId) throw schemaError('INVALID_CATEGORY', '请选择分类');
  // 显式传入 cover（包括 ""/null）时必须尊重该值，不能再回退到旧 image 或占位图。
  // 只有旧文档完全没有 cover 字段时，才兼容读取 image。
  const coverSource = hasOwn(raw, 'cover')
    ? raw.cover
    : (hasOwn(raw, 'image') ? raw.image : (options.publicRead ? DEFAULT_COVER : ''));
  const cover = cleanString(coverSource, 1000);
  assertCloudImageReference(cover, 'cover', strict);
  // 列表用的小图；coverThumbOf 记录它由哪张主图生成，主图换了之后旧小图自动失效。
  const coverThumb = cleanString(raw.coverThumb, 1000);
  assertCloudImageReference(coverThumb, 'coverThumb', strict);
  const coverThumbOf = coverThumb ? cleanString(raw.coverThumbOf, 1000) : '';
  const images = imageArray(raw.images, strict);
  const recommended = hasOwn(raw, 'recommended')
    ? booleanValue(raw, 'recommended', false, strict)
    : booleanValue(raw, 'isPopular', false, strict);
  const ingredientSource = strict && hasOwn(raw, 'ingredients')
    ? raw.ingredients
    : (Array.isArray(raw.ingredients) && raw.ingredients.length > 0
      ? raw.ingredients
      : (typeof raw.ingredients === 'string' && raw.ingredients.trim()
        ? raw.ingredients
        : (raw.legacyIngredients || raw.ingredients)));
  const stepSource = strict && hasOwn(raw, 'steps')
    ? raw.steps
    : (Array.isArray(raw.steps) && raw.steps.length > 0
      ? raw.steps
      : (typeof raw.steps === 'string' && raw.steps.trim()
        ? raw.steps
        : (raw.legacySteps || raw.steps)));
  const ingredients = ingredientsArray(ingredientSource, strict);
  const steps = stepsArray(stepSource, strict);
  const legacyIngredients = strict
    ? ingredients.map(item => [item.name, item.amount].filter(Boolean).join(' ')).join('\n').slice(0, 10000)
    : (typeof ingredientSource === 'string'
      ? ingredientSource.slice(0, 10000)
      : cleanString(raw.legacyIngredients, 10000));
  const legacySteps = strict
    ? steps.map(item => `${item.stepNumber}. ${item.description}`).join('\n').slice(0, 30000)
    : (typeof stepSource === 'string'
      ? stepSource.slice(0, 30000)
      : cleanString(raw.legacySteps, 30000));
  // 旧 availableIceLevels 只作为读取/迁移回退来源，不再作为 V2 写入字段。
  const legacyIceLevels = type === 'drink'
    ? stringArray(raw.availableIceLevels, 20, 30, strict, 'availableIceLevels')
    : [];
  const availableTemperatures = type === 'drink'
    ? (hasOwn(raw, 'availableTemperatures')
      ? stringArray(raw.availableTemperatures, 20, 30, strict, 'availableTemperatures')
      : legacyIceLevels)
    : [];

  return {
    name,
    type,
    categoryId,
    categoryName,
    category: categoryName,
    cover,
    image: cover,
    coverThumb,
    coverThumbOf,
    images,
    description: cleanString(raw.description, 1000),
    tags: stringArray(raw.tags, 30, 50, strict, 'tags'),
    price: priceValue(raw.price, strict),
    estimatedTime: normalizeEstimatedTime(raw.estimatedTime),
    servingSize: normalizeServingSize(raw.servingSize),
    spicyLevel: normalizeSpicyLevel(raw.spicyLevel),
    ingredients,
    steps,
    tips: cleanString(raw.tips, 2000),
    recommended,
    isPopular: recommended,
    signature: booleanValue(raw, 'signature', false, strict),
    availableToday: booleanValue(raw, 'availableToday', raw.status !== 'unavailable', strict),
    soldOut: booleanValue(raw, 'soldOut', false, strict),
    enabled: booleanValue(raw, 'enabled', true, strict),
    sort: sortValue(raw.sort, strict),
    availableCupSizes: type === 'drink'
      ? sanitizedStringArray(raw.availableCupSizes, 20, 50, strict, 'availableCupSizes')
      : [],
    availableSugarLevels: type === 'drink'
      ? sugarLevelArray(raw.availableSugarLevels, strict)
      : [],
    availableTemperatures,
    availableSweetenerTypes: type === 'drink'
      ? stringArray(raw.availableSweetenerTypes, 20, 30, strict, 'availableSweetenerTypes')
      : [],
    availableToppings: type === 'drink'
      ? stringArray(raw.availableToppings, 100, 50, strict, 'availableToppings')
      : [],
    availableTastePreferences: type === 'food'
      ? sanitizedStringArray(raw.availableTastePreferences, 30, 50, strict, 'availableTastePreferences')
      : [],
    availableCustomRequests: type === 'food'
      ? sanitizedStringArray(raw.availableCustomRequests, 100, 50, strict, 'availableCustomRequests')
      : [],
    mealRoles: mealRolesArray(raw.mealRoles, type, strict),
    // publicDish 使用非严格模式读取旧文档时保留旧字段；create/update 严格写入时不再返回它。
    ...(!strict ? { availableIceLevels: legacyIceLevels } : {}),
    legacyIngredients,
    legacySteps,
  };
}

function publicDish(raw = {}) {
  try {
    const categoryName = cleanString(raw.categoryName || raw.category, 50) || '未分类';
    const normalized = dishForWrite({ ...raw, name: cleanString(raw.name, 100) || '未命名菜品' }, {
      id: raw.categoryId || `legacy:${encodeURIComponent(categoryName)}`,
      name: categoryName,
    }, { legacy: true, publicRead: true });
    return {
      ...raw,
      ...normalized,
      id: raw.id || raw._id || '',
      schemaVersion: Number(raw.schemaVersion) || 1,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  } catch (error) {
    const categoryName = cleanString(raw.categoryName || raw.category, 50) || '未分类';
    const cover = cleanString(raw.cover || raw.image || DEFAULT_COVER, 1000);
    return {
      id: raw.id || raw._id || '', name: cleanString(raw.name, 100) || '未命名菜品',
      type: inferDishType(raw), categoryId: cleanString(raw.categoryId, 100),
      categoryName, category: categoryName, cover, image: cover,
      images: [], description: '', tags: [], price: null,
      estimatedTime: '', servingSize: '', spicyLevel: 'none',
      ingredients: [], steps: [], tips: '', recommended: false, isPopular: false,
      signature: false, availableToday: true, soldOut: false,
      enabled: raw.enabled !== false, sort: 0,
      availableCupSizes: [], availableSugarLevels: [], availableIceLevels: [], availableTemperatures: [],
      availableSweetenerTypes: [], availableToppings: [],
      availableTastePreferences: [], availableCustomRequests: [],
      mealRoles: inferDishType(raw) === 'drink' ? ['drink'] : [],
      schemaVersion: Number(raw.schemaVersion) || 1,
      createdAt: raw.createdAt || null, updatedAt: raw.updatedAt || null,
    };
  }
}

function inferCategoryType(raw = {}) {
  const explicitType = raw.type || raw.itemType;
  if (VALID_CATEGORY_TYPES.includes(explicitType)) return explicitType;
  const name = cleanString(raw.name || raw.category, 50);
  if (/饮品|饮料|咖啡|茶|果汁|奶昔/.test(name)) return 'drink';
  if (/菜|汤|饭|面|粥|肉|素|主食|小吃|甜品|甜点|早餐|夜宵/.test(name)) return 'food';
  return 'all';
}

function categoryForWrite(raw = {}, options = {}) {
  const strict = options.legacy !== true;
  const name = cleanString(raw.name || raw.category, 50);
  if (!name) throw schemaError('INVALID_CATEGORY', '分类名称不能为空');
  let type = raw.type || raw.itemType;
  if (!VALID_CATEGORY_TYPES.includes(type)) {
    if (strict && type !== undefined && type !== null && type !== '') {
      throw schemaError('INVALID_CATEGORY_TYPE', '分类 type 必须是 food、drink 或 all');
    }
    type = inferCategoryType(raw);
  }
  return {
    name,
    icon: cleanString(raw.icon, 1000),
    type,
    enabled: booleanValue(raw, 'enabled', true, strict),
    sort: sortValue(raw.sort, strict),
  };
}

function publicCategory(raw = {}) {
  try {
    return {
      ...raw,
      ...categoryForWrite(raw, { legacy: true }),
      id: raw.id || raw._id || '',
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  } catch (error) {
    return {
      id: raw.id || raw._id || '', name: cleanString(raw.name || raw.category, 50) || '未分类',
      icon: '', type: inferCategoryType(raw), enabled: true, sort: 0,
      createdAt: raw.createdAt || null, updatedAt: raw.updatedAt || null,
    };
  }
}

module.exports = {
  assertDishOrderable,
  canOrderDish,
  VALID_CATEGORY_TYPES,
  VALID_DISH_TYPES,
  VALID_SPICY_LEVELS,
  VALID_MEAL_ROLES,
  categoryForWrite,
  cleanString,
  dishForWrite,
  inferCategoryType,
  isCloudFileID,
  mealRolesArray,
  getDishOrderRestriction,
  normalizeEstimatedTime,
  normalizeServingSize,
  normalizeSpicyLevel,
  publicCategory,
  publicDish,
};
