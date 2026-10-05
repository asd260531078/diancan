const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const schema = require('../utils/schema');
const {
  DEFAULT_COVER,
  buildDrinkSpecRows,
  decorateDetailDish,
} = require('../utils/detail-presentation');

function testFoodDetailAndImages() {
  const warnings = [];
  const dish = schema.normalizeDish({
    _id: 'food-1',
    name: '可乐鸡翅',
    type: 'food',
    categoryId: 'cat-main',
    cover: 'wxfile://legacy-cover.jpg',
    tags: ['招牌', '家人最爱'],
    ingredients: [{ id: 'i1', name: '鸡翅', amount: '500g', note: '' }],
    steps: [
      { id: 's1', description: '洗净划刀', image: 'cloud://env/dishes/step.jpg' },
      { id: 's2', description: '煎至金黄', image: 'http://tmp/old.jpg' },
    ],
    tips: '先煎再炖。',
  });
  const detail = decorateDetailDish(dish, (...args) => warnings.push(args));
  assert.strictEqual(detail.cover, DEFAULT_COVER);
  assert.strictEqual(detail.steps[0].image, 'cloud://env/dishes/step.jpg');
  assert.strictEqual(detail.steps[1].image, '');
  assert.strictEqual(detail.ingredients[0].name, '鸡翅');
  assert.strictEqual(detail.tips, '先煎再炖。');
  assert.strictEqual(warnings.length, 2);
}

function testDrinkSpecsAndLegacyTemperature() {
  const dish = schema.normalizeDish({
    _id: 'drink-1',
    name: '百香果柠檬茶',
    type: 'drink',
    categoryId: 'cat-drink',
    availableCupSizes: ['中杯500ml', '大杯700ml'],
    availableSugarLevels: ['正常糖', '半糖', '无糖'],
    availableTemperatures: [],
    availableIceLevels: ['去冰', '少冰'],
    availableSweetenerTypes: ['普通糖浆', '蜂蜜'],
    availableToppings: ['椰果', '芋圆'],
  });
  const rows = buildDrinkSpecRows(decorateDetailDish(dish, () => {}));
  assert.deepStrictEqual(rows.map(row => row.label), ['可选杯型', '可选甜度', '可选温度', '甜味来源', '可选小料']);
  assert.deepStrictEqual(rows[0].values, ['中杯500ml', '大杯700ml']);
  assert.deepStrictEqual(rows[1].values, ['正常甜', '半甜', '不另外加糖']);
  assert.deepStrictEqual(rows[2].values, ['去冰', '少冰']);
}

function testEmptyDetailDefaults() {
  const dish = decorateDetailDish(schema.normalizeDish({
    _id: 'minimal', name: '简单菜品', type: 'food', categoryId: 'cat-main',
  }), () => {});
  assert.strictEqual(dish.cover, DEFAULT_COVER);
  assert.deepStrictEqual(dish.tags, []);
  assert.deepStrictEqual(dish.ingredients, []);
  assert.deepStrictEqual(dish.steps, []);
  assert.strictEqual(dish.tips, '');
  assert.deepStrictEqual(buildDrinkSpecRows(dish), []);
}

function testPageContracts() {
  const js = fs.readFileSync(path.join(root, 'package-extra/detail/detail.js'), 'utf8');
  const wxml = fs.readFileSync(path.join(root, 'package-extra/detail/detail.wxml'), 'utf8');
  const catalog = fs.readFileSync(path.join(root, 'services/catalog.js'), 'utf8');
  assert.ok(catalog.includes('async function getDish(dishId, options = {})'));
  assert.ok(js.includes("catalogService.getDish(dishId, { allowLocalFallback: false })"));
  assert.ok(js.includes('includeDisabled: true'), 'admin preview must read disabled dishes securely');
  assert.ok(wxml.includes("binderror='onCoverError'"));
  assert.ok(wxml.includes("binderror='onStepImageError'"));
  assert.ok(wxml.includes('drinkSpecRows.length > 0'));
  assert.ok(wxml.includes("bindtap='openFoodOptionsFromDetail'"), 'food detail must use the shared food option flow');
  assert.ok(wxml.includes("disabled='{{!detailCanOrder}}'"), 'detail order buttons must follow the unified orderable state');
  assert.ok(wxml.includes('返回菜单'));
}

testFoodDetailAndImages();
testDrinkSpecsAndLegacyTemperature();
testEmptyDetailDefaults();
testPageContracts();
console.log('detail-presentation tests passed');
