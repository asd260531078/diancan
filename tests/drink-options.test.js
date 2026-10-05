const assert = require('assert');
const options = require('../config/drink-options');
const fs = require('fs');
const path = require('path');

assert.deepStrictEqual(options.CUP_SIZE_OPTIONS, ['小杯350ml', '中杯500ml', '大杯700ml']);
assert.deepStrictEqual(options.SUGAR_LEVELS, ['正常甜', '七分甜', '少甜', '半甜', '三分甜', '微甜', '不另外加糖']);
assert.deepStrictEqual(
  options.normalizeSugarLevels(['正常糖', '半糖', '无糖', '半甜']),
  ['正常甜', '半甜', '不另外加糖'],
);
assert.strictEqual(options.LEGACY_SUGAR_LEVEL_MAP['无糖'], '不另外加糖');
assert.deepStrictEqual(options.TEMPERATURE_OPTIONS, ['去冰', '少冰', '正常冰', '温', '热']);
assert.ok(options.SWEETENER_TYPES.includes('普通糖浆'));
assert.ok(options.SWEETENER_TYPES.includes('零卡糖'));
['黑糖珍珠', '脆啵啵', '寒天晶球', '椰果', '芋圆', '仙草', '西米', '布丁', '红豆', '芦荟']
  .forEach(name => assert.ok(options.ALL_TOPPINGS.includes(name), `missing topping preset: ${name}`));
assert.strictEqual(new Set(options.ALL_TOPPINGS).size, options.ALL_TOPPINGS.length, 'preset toppings must be unique');

const root = path.resolve(__dirname, '..');
const detailWxml = fs.readFileSync(path.join(root, 'package-extra/detail/detail.wxml'), 'utf8');
const detailPresentation = fs.readFileSync(path.join(root, 'utils/detail-presentation.js'), 'utf8');
assert.ok(detailPresentation.includes("label: '可选杯型'"), 'detail must build cup-size display row first');
assert.ok(detailPresentation.includes("label: '可选甜度'"), 'detail must build sugar display row');
assert.ok(detailPresentation.includes('normalizeSugarLevels'), 'detail must normalize legacy sugar labels');
assert.ok(detailPresentation.includes("label: '可选温度'"), 'detail must build temperature display row');
assert.ok(detailPresentation.includes("label: '甜味来源'"), 'detail must build sweetener display row');
assert.ok(detailPresentation.includes("label: '可选小料'"), 'detail must build topping display row');
assert.ok(detailPresentation.includes('dish.availableIceLevels'), 'detail must retain the legacy ice-level fallback');
assert.ok(detailWxml.includes("wx:for='{{drinkSpecRows}}'"), 'detail must render normalized drink specification rows');
assert.ok(detailWxml.includes('drinkSpecRows.length > 0'), 'detail must hide the entire empty specification section');
assert.ok(detailWxml.includes('本页面仅展示支持的规格'), 'detail must remain read-only');

console.log('drink options tests passed');
