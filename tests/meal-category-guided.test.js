const assert = require('assert');
const {
  generateCategoryGuidedMeal,
  getCandidatesByCategory,
  getEligibleDrinkCategories,
  getEligibleFoodCategories,
  normalizeCategoryGuidedSelection,
} = require('../package-extra/utils/meal-random');

function category(id, type, sort, enabled = true, name = id) {
  return { id, name, type, sort, enabled };
}

function dish(id, type, categoryId, overrides = {}) {
  return {
    id,
    name: id,
    type,
    categoryId,
    enabled: true,
    availableToday: true,
    soldOut: false,
    price: 10,
    ...overrides,
  };
}

const categories = [
  category('food-b', 'food', 10),
  category('all-mixed', 'all', 15),
  category('food-a', 'food', 20),
  category('drink-b', 'drink', 5),
  category('drink-a', 'drink', 30),
  category('empty-food', 'food', 1),
  category('sold-food', 'food', 2),
  category('unavailable-food', 'food', 3),
  category('disabled-food', 'food', 4, false),
  category('all', 'all', 0, true, '全部'),
];

const dishes = [
  dish('food-a-1', 'food', 'food-a'),
  dish('food-a-2', 'food', 'food-a', { price: null }),
  dish('food-b-1', 'food', 'food-b'),
  dish('mixed-food', 'food', 'all-mixed'),
  dish('drink-a-1', 'drink', 'drink-a'),
  dish('drink-a-2', 'drink', 'drink-a', { price: null }),
  dish('drink-b-1', 'drink', 'drink-b'),
  dish('mixed-drink', 'drink', 'all-mixed'),
  dish('sold-only', 'food', 'sold-food', { soldOut: true }),
  dish('unavailable-only', 'food', 'unavailable-food', { availableToday: false }),
  dish('disabled-category-item', 'food', 'disabled-food'),
  dish('virtual-all-item', 'food', 'all'),
];

const foodCategories = getEligibleFoodCategories(dishes, categories);
assert.deepStrictEqual(foodCategories.map(item => item.id), ['food-b', 'all-mixed', 'food-a']);
assert.ok(!foodCategories.some(item => item.id === 'empty-food'));
assert.ok(!foodCategories.some(item => item.id === 'sold-food'));
assert.ok(!foodCategories.some(item => item.id === 'unavailable-food'));
assert.ok(!foodCategories.some(item => item.id === 'disabled-food'));
assert.ok(!foodCategories.some(item => item.id === 'all'));

const drinkCategories = getEligibleDrinkCategories(dishes, categories);
assert.deepStrictEqual(drinkCategories.map(item => item.id), ['drink-b', 'all-mixed', 'drink-a']);
assert.ok(drinkCategories.every(item => item.enabled !== false));

assert.deepStrictEqual(
  normalizeCategoryGuidedSelection({ foodCategoryIds: ['food-a'], includeDrink: false, drinkCategoryId: 'drink-a' }),
  { foodCategoryIds: ['food-a'], foodCategoryCounts: { 'food-a': 1 }, includeDrink: false, drinkCategoryId: '' },
);
assert.deepStrictEqual(
  normalizeCategoryGuidedSelection({ foodCategoryIds: ['food-b'], includeDrink: true, drinkCategoryId: 'drink-b' }),
  { foodCategoryIds: ['food-b'], foodCategoryCounts: { 'food-b': 1 }, includeDrink: true, drinkCategoryId: 'drink-b' },
);

const strictFood = getCandidatesByCategory(dishes, categories, 'food-a', 'food');
assert.deepStrictEqual(strictFood.map(item => item.id), ['food-a-1', 'food-a-2']);
const strictDrink = getCandidatesByCategory(dishes, categories, 'drink-a', 'drink');
assert.deepStrictEqual(strictDrink.map(item => item.id), ['drink-a-1', 'drink-a-2']);

const withoutDrink = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['food-b'], includeDrink: false,
}, {}, { random: () => 0 });
assert.deepStrictEqual(withoutDrink.items.map(item => item.dish.id), ['food-b-1']);
assert.strictEqual(withoutDrink.drink, null);

const withDrink = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['food-a'], includeDrink: true, drinkCategoryId: 'drink-a',
}, {}, { random: () => 0 });
assert.strictEqual(withDrink.food.categoryId, 'food-a');
assert.strictEqual(withDrink.drink.categoryId, 'drink-a');
assert.deepStrictEqual(withDrink.selection, {
  foodCategoryIds: ['food-a'], foodCategoryCounts: { 'food-a': 1 }, includeDrink: true, drinkCategoryId: 'drink-a',
});

const changed = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['food-a'], includeDrink: true, drinkCategoryId: 'drink-a',
}, { foodId: 'food-a-1', drinkId: 'drink-a-1' }, { random: () => 0 });
assert.strictEqual(changed.food.id, 'food-a-2');
assert.strictEqual(changed.drink.id, 'drink-a-2');
assert.deepStrictEqual(changed.selection.foodCategoryIds, ['food-a']);
assert.strictEqual(changed.selection.drinkCategoryId, 'drink-a');

const oneItem = generateCategoryGuidedMeal(
  [dish('only-food', 'food', 'food-a')],
  categories,
  { foodCategoryIds: ['food-a'], includeDrink: false },
);
assert.strictEqual(oneItem.food.id, 'only-food');

const noFood = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['missing'], includeDrink: false,
});
assert.strictEqual(noFood.missingFoodCandidates, true);
assert.strictEqual(noFood.items.length, 0);

const noDrink = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['food-a'], includeDrink: true, drinkCategoryId: 'missing',
});
assert.strictEqual(noDrink.missingDrinkCandidates, true);
assert.strictEqual(noDrink.food.categoryId, 'food-a');

const unpriced = generateCategoryGuidedMeal(dishes, categories, {
  foodCategoryIds: ['food-a'], includeDrink: true, drinkCategoryId: 'drink-a',
}, {}, { random: () => 0.99 });
assert.strictEqual(unpriced.hasUnpricedItems, true);
assert.strictEqual(unpriced.displayTotalAmount, 0);

console.log('meal category guided tests passed');
