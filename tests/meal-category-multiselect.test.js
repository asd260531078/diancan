const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  MAX_FOOD_CATEGORY_SELECTION,
  generateCategoryGuidedMeal,
  normalizeCategoryGuidedSelection,
  toggleFoodCategorySelection,
} = require('../package-extra/utils/meal-random');
const {
  cancelMealBatch,
  createMealBatch,
  getMealBatchSelections,
  isMealBatchComplete,
  recordMealBatchSelection,
} = require('../package-extra/utils/meal-batch');

function category(id, type = 'food', sort = 0) {
  return { id, name: id, type, sort, enabled: true };
}

function dish(id, categoryId, overrides = {}) {
  return {
    id,
    name: id,
    type: 'food',
    categoryId,
    enabled: true,
    availableToday: true,
    soldOut: false,
    price: 10,
    ...overrides,
  };
}

assert.strictEqual(MAX_FOOD_CATEGORY_SELECTION, 5);
let selection = toggleFoodCategorySelection([], 'main');
assert.deepStrictEqual(selection.ids, ['main']);
selection = toggleFoodCategorySelection(selection.ids, 'soup');
assert.deepStrictEqual(selection.ids, ['main', 'soup']);
selection = toggleFoodCategorySelection(selection.ids, 'main');
assert.deepStrictEqual(selection.ids, ['soup']);
assert.strictEqual(toggleFoodCategorySelection([], '').ids.length, 0);
assert.strictEqual(toggleFoodCategorySelection(['main'], 'soup').ids.length, 2);

selection = { ids: [], limitReached: false };
['a', 'b', 'c', 'd', 'e'].forEach(id => {
  selection = toggleFoodCategorySelection(selection.ids, id);
});
const blocked = toggleFoodCategorySelection(selection.ids, 'f');
assert.strictEqual(blocked.limitReached, true);
assert.deepStrictEqual(blocked.ids, ['a', 'b', 'c', 'd', 'e']);

assert.deepStrictEqual(
  normalizeCategoryGuidedSelection({
    foodCategoryIds: [' main ', 'soup', 'main', '', 'dessert'],
    includeDrink: false,
  }).foodCategoryIds,
  ['main', 'soup', 'dessert'],
);

const categories = [
  category('main'),
  category('soup'),
  category('dessert'),
  category('other'),
  category('coffee', 'drink'),
];
const dishes = [
  dish('main-1', 'main', { price: 20 }),
  dish('main-2', 'main', { price: 22 }),
  dish('soup-1', 'soup', { price: 8 }),
  dish('soup-2', 'soup', { price: 9 }),
  dish('dessert-1', 'dessert', { price: 12 }),
  dish('dessert-2', 'dessert', { price: null }),
  dish('other-1', 'other'),
  dish('coffee-1', 'coffee', { type: 'drink', price: 15 }),
  dish('coffee-2', 'coffee', { type: 'drink', price: 18 }),
];

const result = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['main', 'soup', 'dessert'],
  includeDrink: false,
}, {}, { random: () => 0 });
assert.strictEqual(result.foodItems.length, 3);
assert.deepStrictEqual(result.foodItems.map(item => item.categoryId), ['main', 'soup', 'dessert']);
assert.deepStrictEqual(result.foodItems.map(item => item.dish.id), ['main-1', 'soup-1', 'dessert-1']);
assert.ok(!result.items.some(item => item.dish.categoryId === 'other'));
assert.strictEqual(new Set(result.items.map(item => item.dish.id)).size, result.items.length);
assert.strictEqual(result.drink, null);
assert.strictEqual(result.displayTotalAmount, 40);

const changed = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['main', 'soup', 'dessert'],
  includeDrink: true,
  drinkCategoryId: 'coffee',
}, {
  foodDishByCategory: { main: 'main-1', soup: 'soup-1', dessert: 'dessert-1' },
  drinkId: 'coffee-1',
}, { random: () => 0 });
assert.deepStrictEqual(changed.selection.foodCategoryIds, ['main', 'soup', 'dessert']);
assert.deepStrictEqual(changed.foodItems.map(item => item.dish.id), ['main-2', 'soup-2', 'dessert-2']);
assert.strictEqual(changed.drink.id, 'coffee-2');
assert.strictEqual(changed.drink.categoryId, 'coffee');
assert.strictEqual(changed.hasUnpricedItems, true);
assert.strictEqual(changed.displayTotalAmount, 49);

const singleCandidate = generateCategoryGuidedMeal(
  [dish('only-soup', 'soup')],
  categories,
  { foodCategoryIds: ['soup'], includeDrink: false },
  { foodDishByCategory: { soup: 'only-soup' } },
);
assert.strictEqual(singleCandidate.foodItems[0].dish.id, 'only-soup');

const missing = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['main', 'missing-category'], includeDrink: false,
});
assert.strictEqual(missing.missingFoodCandidates, true);
assert.strictEqual(missing.missingFoodCategory.id, 'missing-category');
assert.strictEqual(missing.items.length, 0);

const duplicateDefence = generateCategoryGuidedMeal([
  dish('shared', 'main'),
  dish('shared', 'soup'),
  dish('soup-unique', 'soup'),
], categories, {
  foodCategoryIds: ['main', 'soup'], includeDrink: false,
}, {}, { random: () => 0 });
assert.deepStrictEqual(duplicateDefence.items.map(item => item.dish.id), ['shared', 'soup-unique']);

const root = path.join(__dirname, '..');
const pageJs = fs.readFileSync(path.join(root, 'package-extra/meal-random/meal-random.js'), 'utf8');
const pageWxml = fs.readFileSync(path.join(root, 'package-extra/meal-random/meal-random.wxml'), 'utf8');
assert.ok(pageJs.includes('onFoodCategoryToggle'));
assert.ok(pageJs.includes('onFoodCategoriesNext'));
assert.ok(pageJs.includes('foodCategoryIds'));
assert.ok(!pageJs.includes('onFoodCategorySelect'));
assert.ok(pageWxml.includes("disabled=\"{{foodCategoryIds.length === 0}}\""));
assert.ok(pageWxml.includes('已选择 {{foodCategoryIds.length}} 项'));
assert.ok(pageWxml.includes('class="selected-mark"'));

const foodWithOptions = dish('spicy-main', 'main', {
  availableTastePreferences: ['少辣', '正常辣'],
});
const soup = dish('plain-soup', 'soup');
const drink = dish('coffee', 'coffee', {
  type: 'drink', availableCupSizes: ['中杯'],
});
let batch = createMealBatch([foodWithOptions, soup, drink]);
batch = recordMealBatchSelection(batch, { tastePreference: '少辣', customRequests: [] });
batch = recordMealBatchSelection(batch, { tastePreference: '', customRequests: [] });
batch = recordMealBatchSelection(batch, {
  cupSize: '中杯', sugarLevel: '', temperature: '', sweetener: '', toppings: [],
});
assert.strictEqual(isMealBatchComplete(batch), true);
assert.strictEqual(getMealBatchSelections(batch).length, 3);
assert.deepStrictEqual(getMealBatchSelections(cancelMealBatch(createMealBatch([foodWithOptions, soup, drink]))), []);

console.log('meal category multiselect tests passed');
