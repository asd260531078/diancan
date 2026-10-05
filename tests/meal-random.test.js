const assert = require('assert');
const {
  normalizeMealRoles,
} = require('../config/meal-roles');
const {
  buildMealCandidates,
  calculateMealDisplayTotal,
  combinationIds,
  generateRandomMeal,
  isSameCombination,
} = require('../package-extra/utils/meal-random');

function category(id, enabled = true) {
  return { id, enabled };
}

function dish(id, type, mealRoles, overrides = {}) {
  return {
    id,
    name: id,
    type,
    categoryId: type === 'drink' ? 'drink-cat' : 'food-cat',
    mealRoles,
    enabled: true,
    availableToday: true,
    soldOut: false,
    price: 10,
    ...overrides,
  };
}

const categories = [category('food-cat'), category('drink-cat')];

assert.deepStrictEqual(normalizeMealRoles([' main ', 'side', 'main', 'unknown'], 'food'), ['main', 'side']);
assert.deepStrictEqual(normalizeMealRoles(undefined, 'drink'), ['drink']);
assert.deepStrictEqual(normalizeMealRoles(['main'], 'drink', { strict: true }), ['drink']);
assert.throws(() => normalizeMealRoles(['unknown'], 'food', { strict: true }), /未知餐食角色/);
assert.throws(() => normalizeMealRoles(['drink'], 'food', { strict: true }), /food 不能使用 drink/);

const standard = [
  dish('main-1', 'food', ['main']),
  dish('main-2', 'food', ['main']),
  dish('side-1', 'food', ['side']),
  dish('side-2', 'food', ['side']),
  dish('drink-1', 'drink'),
  dish('drink-2', 'drink'),
];
const standardResult = generateRandomMeal(standard, categories, [], { random: () => 0 });
assert.deepStrictEqual(standardResult.items.map(item => item.role), ['main', 'side', 'drink']);
assert.strictEqual(new Set(combinationIds(standardResult.items)).size, 3);

const fallbackStaple = generateRandomMeal([
  dish('main', 'food', ['main']),
  dish('rice', 'food', ['staple']),
  dish('drink', 'drink'),
], categories, [], { random: () => 0 });
assert.deepStrictEqual(fallbackStaple.items.map(item => item.role), ['main', 'staple', 'drink']);

const fallbackSoup = generateRandomMeal([
  dish('main', 'food', ['main']),
  dish('soup', 'food', ['soup']),
  dish('drink', 'drink'),
], categories, [], { random: () => 0 });
assert.deepStrictEqual(fallbackSoup.items.map(item => item.role), ['main', 'soup', 'drink']);

const foodOnly = generateRandomMeal([
  dish('food-a', 'food', []),
  dish('food-b', 'food', []),
], categories, [], { random: () => 0 });
assert.strictEqual(foodOnly.items.length, 2);
assert.strictEqual(new Set(combinationIds(foodOnly.items)).size, 2);

assert.strictEqual(generateRandomMeal([dish('only', 'food', [])], categories).items.length, 1);
assert.strictEqual(generateRandomMeal([], categories).items.length, 0);

const multiRole = generateRandomMeal([
  dish('both', 'food', ['main', 'side']),
  dish('other', 'food', ['side']),
  dish('drink', 'drink'),
], categories, [], { random: () => 0 });
assert.strictEqual(new Set(combinationIds(multiRole.items)).size, multiRole.items.length);

const filtered = buildMealCandidates([
  dish('ok', 'food', ['main']),
  dish('disabled', 'food', ['side'], { enabled: false }),
  dish('sold', 'food', ['side'], { soldOut: true }),
  dish('not-today', 'food', ['side'], { availableToday: false }),
  dish('disabled-category', 'food', ['side'], { categoryId: 'off-cat' }),
], [...categories, category('off-cat', false)]);
assert.deepStrictEqual(filtered.map(item => item.id), ['ok']);

const previous = ['main-1', 'side-1', 'drink-1'];
const values = [0, 0, 0, 0.99, 0, 0];
let randomIndex = 0;
const changed = generateRandomMeal(standard, categories, previous, {
  random: () => values[randomIndex++] ?? 0.99,
});
assert.strictEqual(isSameCombination(changed.items, previous.map(id => ({ id }))), false);

const total = calculateMealDisplayTotal([
  { dish: dish('priced', 'food', [], { price: 12.3 }) },
  { dish: dish('unpriced', 'food', [], { price: null }) },
]);
assert.deepStrictEqual(total, { displayTotalAmount: 12.3, hasUnpricedItems: true });

console.log('meal random tests passed');
