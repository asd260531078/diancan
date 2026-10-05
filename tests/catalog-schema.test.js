const assert = require('assert');
const clientSchema = require('../utils/schema');
const serverSchema = require('../cloudfunctions/familyApi/schema');

function testLegacyDishNormalization() {
  const legacy = {
    id: 'D001',
    name: '柠檬茶',
    image: 'https://example.com/lemon.jpg',
    category: '饮品',
    isPopular: true,
    price: 12,
    estimatedTime: 10,
    servingSize: 2,
    spicyLevel: 0,
    ingredients: '柠檬 1个\n茶汤 300ml',
    steps: '1. 切柠檬\n2. 加入茶汤',
    enabled: true,
  };

  const dish = clientSchema.normalizeDish(legacy);
  assert.strictEqual(dish.id, 'D001');
  assert.strictEqual(dish.type, 'drink');
  assert.strictEqual(dish.cover, legacy.image);
  assert.strictEqual(dish.recommended, true);
  assert.strictEqual(dish.estimatedTime, '10分钟');
  assert.strictEqual(dish.servingSize, '2人');
  assert.strictEqual(dish.spicyLevel, 'none');
  assert.strictEqual(dish.ingredients.length, 2);
  assert.strictEqual(dish.ingredientsText, legacy.ingredients);
  assert.strictEqual(dish.steps.length, 2);
  assert.strictEqual(dish.stepsText, legacy.steps);
  assert.strictEqual(dish.steps[0].description, '切柠檬');
  assert.ok(dish.categoryId.startsWith('legacy:'));
  assert.strictEqual(dish.availableToday, true);
  assert.strictEqual(dish.soldOut, false);
  assert.deepStrictEqual(dish.tags, []);
}

function testClientPreparesLegacyTextForStrictCloudWrite() {
  const prepared = clientSchema.prepareDishWritePayload({
    ingredients: '鸡翅 500g\n可乐 330ml',
    steps: '1. 洗净\n2. 煎香',
    tags: '招牌,下饭',
    estimatedTime: 35,
    servingSize: '2-3',
    spicyLevel: 1,
  });
  assert.strictEqual(prepared.ingredients.length, 2);
  assert.strictEqual(prepared.steps.length, 2);
  assert.deepStrictEqual(prepared.tags, ['招牌', '下饭']);
  assert.strictEqual(prepared.estimatedTime, '35分钟');
  assert.strictEqual(prepared.servingSize, '2-3人');
  assert.strictEqual(prepared.spicyLevel, 'mild');
}

function testStrictServerWriteAndCompatibilityAliases() {
  const fileID = 'cloud://family-env.1234/dish-images/red-pork.jpg';
  const written = serverSchema.dishForWrite({
    name: '红烧肉',
    type: 'food',
    image: fileID,
    isPopular: true,
    ingredients: [{ name: '五花肉', amount: '500g' }],
    steps: [{ stepNumber: 1, title: '', description: '焯水', image: '' }],
  }, { id: 'cat_main', name: '主菜', type: 'food' });

  assert.strictEqual(written.type, 'food');
  assert.strictEqual(written.categoryId, 'cat_main');
  assert.strictEqual(written.cover, fileID);
  assert.strictEqual(written.image, fileID);
  assert.strictEqual(written.recommended, true);
  assert.strictEqual(written.isPopular, true);
  assert.strictEqual(written.estimatedTime, '');
  assert.strictEqual(written.servingSize, '');
  assert.strictEqual(written.spicyLevel, 'none');
  assert.deepStrictEqual(written.availableCupSizes, []);
  assert.deepStrictEqual(written.availableSugarLevels, []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(written, 'availableIceLevels'), false);
}

function testStrictValidationRejectsInvalidDirectCloudPayloads() {
  const category = { id: 'cat_main', name: '主菜', type: 'food' };
  assert.throws(
    () => serverSchema.dishForWrite({ name: '菜', type: 'dessert' }, category),
    error => error.code === 'INVALID_DISH_TYPE',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '菜', type: 'food', tags: '招牌' }, category),
    error => error.code === 'INVALID_FIELD',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '菜', type: 'food', sort: 'abc' }, category),
    error => error.code === 'INVALID_SORT',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '菜', type: 'food', price: -1 }, category),
    error => error.code === 'INVALID_PRICE',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '菜', type: 'food', cover: 'wxfile://tmp.jpg' }, category),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '菜', type: 'food', images: ['https://example.com/a.jpg'] }, category),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );
  assert.throws(
    () => serverSchema.dishForWrite({
      name: '菜',
      type: 'food',
      steps: [{ stepNumber: 1, description: '完成', image: 'wxfile://step.jpg' }],
    }, category),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );
}

function testClientRejectsTemporaryImagePathsBeforeCallingCloud() {
  assert.throws(
    () => clientSchema.prepareDishWritePayload({ cover: 'wxfile://tmp.jpg' }),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );
  assert.throws(
    () => clientSchema.prepareDishWritePayload({
      steps: [{ stepNumber: 1, description: '完成', image: '/tmp/step.jpg' }],
    }),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );
  const fileID = 'cloud://family-env.1234/dish-images/ok.jpg';
  assert.strictEqual(clientSchema.prepareDishWritePayload({ cover: fileID }).cover, fileID);
}

function testLenientPublicReadNeverThrowsForBadLegacyDocument() {
  const dish = serverSchema.publicDish({
    _id: 'broken-old-doc',
    name: null,
    category: '主菜',
    price: 'not-a-number',
    tags: { bad: true },
    ingredients: 123,
    steps: { bad: true },
  });
  assert.strictEqual(dish.id, 'broken-old-doc');
  assert.strictEqual(dish.name, '未命名菜品');
  assert.strictEqual(dish.price, null);
  assert.deepStrictEqual(dish.tags, []);
  assert.deepStrictEqual(dish.steps, []);
}

function testDrinkOptionsAreKeptOnlyForDrinks() {
  const category = { id: 'cat_drink', name: '饮品', type: 'drink' };
  const drink = serverSchema.dishForWrite({
    name: '咖啡',
    type: 'drink',
    availableCupSizes: ['小杯250ml', '中杯350ml'],
    availableSugarLevels: ['正常糖', '无糖'],
    availableTemperatures: ['正常冰', '热'],
    availableSweetenerTypes: ['普通糖浆', '蜂蜜'],
    availableToppings: ['椰果', '芋圆'],
  }, category);
  assert.deepStrictEqual(drink.availableCupSizes, ['小杯250ml', '中杯350ml']);
  assert.deepStrictEqual(drink.availableSugarLevels, ['正常甜', '不另外加糖']);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(drink, 'availableIceLevels'), false);
  assert.deepStrictEqual(drink.availableTemperatures, ['正常冰', '热']);
  assert.deepStrictEqual(drink.availableSweetenerTypes, ['普通糖浆', '蜂蜜']);
  assert.deepStrictEqual(drink.availableToppings, ['椰果', '芋圆']);

  const food = serverSchema.dishForWrite({
    name: '米饭',
    type: 'food',
    availableCupSizes: ['大杯700ml'],
    availableSugarLevels: ['无糖'],
  }, { id: 'cat_rice', name: '主食', type: 'food' });
  assert.deepStrictEqual(food.availableCupSizes, []);
  assert.deepStrictEqual(food.availableSugarLevels, []);
  assert.deepStrictEqual(food.availableTemperatures, []);
  assert.deepStrictEqual(food.availableSweetenerTypes, []);
  assert.deepStrictEqual(food.availableToppings, []);
}

function testLegacyIceLevelsMapToTemperatures() {
  const raw = {
    _id: 'legacy-drink',
    name: '旧柠檬茶',
    type: 'drink',
    categoryId: 'cat_drink',
    categoryName: '饮品',
    availableIceLevels: ['正常冰', '少冰', '去冰'],
  };
  const serverDish = serverSchema.publicDish(raw);
  const clientDish = clientSchema.normalizeDish(raw);
  assert.deepStrictEqual(serverDish.availableTemperatures, ['正常冰', '少冰', '去冰']);
  assert.deepStrictEqual(clientDish.availableTemperatures, ['正常冰', '少冰', '去冰']);

  const explicitlyCleared = clientSchema.normalizeDish({ ...raw, availableTemperatures: [] });
  assert.deepStrictEqual(explicitlyCleared.availableTemperatures, ['正常冰', '少冰', '去冰']);
}

function testDrinkOptionNormalizationAndValidation() {
  const category = { id: 'cat_drink', name: '饮品', type: 'drink' };
  const drink = serverSchema.dishForWrite({
    name: '百香果柠檬茶',
    type: 'drink',
    availableCupSizes: ['中杯500ml', ' 中杯500ml ', '', '大杯700ml'],
    availableSugarLevels: ['半糖', '半甜', ' 无糖 '],
    availableTemperatures: ['少冰', '正常冰', '少冰'],
    availableSweetenerTypes: ['普通糖浆', ' 蜂蜜 '],
    availableToppings: ['椰果', '椰果', ' 芋圆 '],
  }, category);
  assert.deepStrictEqual(drink.availableCupSizes, ['中杯500ml', '大杯700ml']);
  assert.deepStrictEqual(drink.availableSugarLevels, ['半甜', '不另外加糖']);
  assert.deepStrictEqual(drink.availableTemperatures, ['少冰', '正常冰']);
  assert.deepStrictEqual(drink.availableSweetenerTypes, ['普通糖浆', '蜂蜜']);
  assert.deepStrictEqual(drink.availableToppings, ['椰果', '芋圆']);

  assert.throws(
    () => serverSchema.dishForWrite({ name: '错误饮品', type: 'drink', availableToppings: '椰果' }, category),
    error => error.code === 'INVALID_FIELD',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '错误饮品', type: 'drink', availableCupSizes: '中杯500ml' }, category),
    error => error.code === 'INVALID_FIELD',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '错误饮品', type: 'drink', availableCupSizes: ['中杯500ml', 700] }, category),
    error => error.code === 'INVALID_FIELD',
  );
  assert.throws(
    () => serverSchema.dishForWrite({ name: '错误饮品', type: 'drink', availableTemperatures: [''] }, category),
    error => error.code === 'INVALID_FIELD',
  );
}

function testNewDrinkWritePayloadUsesV2FieldsOnly() {
  const raw = {
    name: '百香果柠檬茶',
    type: 'drink',
    categoryId: 'cat_drink',
    availableCupSizes: ['中杯500ml', '大杯700ml'],
    availableSugarLevels: ['正常糖', '半糖', '无糖'],
    availableIceLevels: ['旧冰量不应写入'],
    availableTemperatures: ['去冰', '少冰', '温'],
    availableSweetenerTypes: ['普通糖浆', '蜂蜜'],
    availableToppings: ['黑糖珍珠', '黄金珍珠', '椰果'],
  };
  const clientPayload = clientSchema.prepareDishWritePayload(raw);
  assert.deepStrictEqual(clientPayload.availableCupSizes, ['中杯500ml', '大杯700ml']);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(clientPayload, 'availableIceLevels'), false);
  const serverPayload = serverSchema.dishForWrite(clientPayload, {
    id: 'cat_drink', name: '饮品', type: 'drink',
  });
  assert.deepStrictEqual(serverPayload.availableCupSizes, ['中杯500ml', '大杯700ml']);
  assert.deepStrictEqual(clientPayload.availableSugarLevels, ['正常甜', '半甜', '不另外加糖']);
  assert.deepStrictEqual(serverPayload.availableSugarLevels, ['正常甜', '半甜', '不另外加糖']);
  assert.deepStrictEqual(serverPayload.availableTemperatures, ['去冰', '少冰', '温']);
  assert.deepStrictEqual(serverPayload.availableSweetenerTypes, ['普通糖浆', '蜂蜜']);
  assert.deepStrictEqual(serverPayload.availableToppings, ['黑糖珍珠', '黄金珍珠', '椰果']);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(serverPayload, 'availableIceLevels'), false);
}

function testCupSizeReadCompatibility() {
  const legacyDrink = clientSchema.normalizeDish({
    _id: 'drink-without-cups', name: '旧饮品', type: 'drink', categoryId: 'cat_drink',
  });
  const legacyFood = clientSchema.normalizeDish({
    _id: 'food-with-cups', name: '旧菜品', type: 'food', categoryId: 'cat_food',
    availableCupSizes: ['大杯700ml'],
  });
  const serverLegacyDrink = serverSchema.publicDish({
    _id: 'server-drink-without-cups', name: '旧饮品', type: 'drink',
    categoryId: 'cat_drink', categoryName: '饮品',
  });
  assert.deepStrictEqual(legacyDrink.availableCupSizes, []);
  assert.deepStrictEqual(serverLegacyDrink.availableCupSizes, []);
  assert.deepStrictEqual(legacyFood.availableCupSizes, []);
}

function testCategoryCompatibility() {
  const legacy = serverSchema.publicCategory({ _id: 'cat_drink', name: '饮品', itemType: 'drink' });
  assert.strictEqual(legacy.type, 'drink');
  assert.strictEqual(legacy.itemType, 'drink');
  assert.strictEqual(legacy.icon, '');
  const unknown = serverSchema.publicCategory({ _id: 'cat_unknown', name: '神秘专区' });
  assert.strictEqual(unknown.type, 'all');
  const canonicalWrite = serverSchema.categoryForWrite({ name: '饮品', type: 'drink', itemType: 'food' });
  assert.strictEqual(canonicalWrite.type, 'drink');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(canonicalWrite, 'itemType'), false);
  const clientUnknown = clientSchema.normalizeCategory({ _id: 'cat_unknown', name: '神秘专区' });
  assert.strictEqual(clientUnknown.type, 'all');
  const clientPayload = clientSchema.prepareCategoryWritePayload({
    name: '共享推荐', type: 'all', itemType: 'food', icon: 'star', sort: 10, enabled: true,
  });
  assert.deepStrictEqual(clientPayload, {
    name: '共享推荐', type: 'all', icon: 'star', sort: 10, enabled: true,
  });
  assert.deepStrictEqual(clientSchema.prepareCategoryWritePayload({ enabled: false }), { enabled: false });
  assert.throws(
    () => serverSchema.categoryForWrite({ name: '错误分类', type: 'dessert' }),
    error => error.code === 'INVALID_CATEGORY_TYPE',
  );
}

function testRecommendationAndSignatureSurviveReadNormalization() {
  const raw = {
    _id: 'drink-1',
    name: '百香果柠檬茶',
    type: 'drink',
    categoryId: 'cat_drink',
    categoryName: '饮品',
    recommended: true,
    signature: true,
    enabled: true,
  };
  const serverDish = serverSchema.publicDish(raw);
  const clientDish = clientSchema.normalizeDish(serverDish);
  assert.strictEqual(serverDish.recommended, true);
  assert.strictEqual(serverDish.signature, true);
  assert.strictEqual(clientDish.recommended, true);
  assert.strictEqual(clientDish.signature, true);
}

testLegacyDishNormalization();
testClientPreparesLegacyTextForStrictCloudWrite();
testStrictServerWriteAndCompatibilityAliases();
testStrictValidationRejectsInvalidDirectCloudPayloads();
testClientRejectsTemporaryImagePathsBeforeCallingCloud();
testLenientPublicReadNeverThrowsForBadLegacyDocument();
testDrinkOptionsAreKeptOnlyForDrinks();
testLegacyIceLevelsMapToTemperatures();
testDrinkOptionNormalizationAndValidation();
testNewDrinkWritePayloadUsesV2FieldsOnly();
testCupSizeReadCompatibility();
testCategoryCompatibility();
testRecommendationAndSignatureSurviveReadNormalization();
console.log('catalog-schema tests passed');
