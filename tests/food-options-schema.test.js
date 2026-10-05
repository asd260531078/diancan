const assert = require('assert');
const clientSchema = require('../utils/schema');
const serverSchema = require('../cloudfunctions/familyApi/schema');

const category = { id: 'cat_food', name: '主菜', type: 'food' };
const written = serverSchema.dishForWrite({
  name: '辣椒炒肉',
  type: 'food',
  categoryId: 'cat_food',
  tags: [], images: [], ingredients: [], steps: [],
  availableTastePreferences: ['少辣', ' 少辣 ', '', '正常辣'],
  availableCustomRequests: ['免葱', ' 免葱 ', '', '免蒜'],
}, category);
assert.deepStrictEqual(written.availableTastePreferences, ['少辣', '正常辣']);
assert.deepStrictEqual(written.availableCustomRequests, ['免葱', '免蒜']);

const drink = serverSchema.dishForWrite({
  name: '柠檬茶',
  type: 'drink',
  categoryId: 'cat_drink',
  tags: [], images: [], ingredients: [], steps: [],
  availableTastePreferences: ['少辣'],
  availableCustomRequests: ['免葱'],
}, { id: 'cat_drink', name: '饮品', type: 'drink' });
assert.deepStrictEqual(drink.availableTastePreferences, []);
assert.deepStrictEqual(drink.availableCustomRequests, []);

assert.throws(
  () => serverSchema.dishForWrite({
    name: '错误菜品', type: 'food', categoryId: 'cat_food', tags: [], images: [], ingredients: [], steps: [],
    availableTastePreferences: '少辣', availableCustomRequests: [],
  }, category),
  /availableTastePreferences 必须是数组/,
);
assert.throws(
  () => serverSchema.dishForWrite({
    name: '错误菜品', type: 'food', categoryId: 'cat_food', tags: [], images: [], ingredients: [], steps: [],
    availableTastePreferences: [], availableCustomRequests: [123],
  }, category),
  /availableCustomRequests 只能包含文本/,
);

const legacyFood = clientSchema.normalizeDish({ name: '旧菜', type: 'food', category: '主菜' });
assert.deepStrictEqual(legacyFood.availableTastePreferences, []);
assert.deepStrictEqual(legacyFood.availableCustomRequests, []);
const normalizedDrink = clientSchema.normalizeDish({
  name: '饮品', type: 'drink', category: '饮品',
  availableTastePreferences: ['少辣'], availableCustomRequests: ['免葱'],
});
assert.deepStrictEqual(normalizedDrink.availableTastePreferences, []);
assert.deepStrictEqual(normalizedDrink.availableCustomRequests, []);

console.log('food options schema tests passed');
