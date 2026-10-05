const assert = require('assert');
const { getMenuSeedV1 } = require('../cloudfunctions/familyApi/data/menu-seed-v1');
const { prepareMenuSeedPlan } = require('../cloudfunctions/familyApi/menu-seed-import');
const { dishForWrite } = require('../cloudfunctions/familyApi/schema');

const seed = getMenuSeedV1();
assert.strictEqual(seed.length, 14);
assert.deepStrictEqual(seed.map(category => category.type), [
  ...Array(8).fill('food'), ...Array(6).fill('drink'),
]);
assert.deepStrictEqual(seed.map(category => category.items.length), [
  ...Array(8).fill(8), ...Array(6).fill(2),
]);

let total = 0;
seed.forEach((category, categoryIndex) => {
  assert.strictEqual(category.sort, (categoryIndex + 1) * 10);
  const names = new Set();
  category.items.forEach((dish, dishIndex) => {
    total += 1;
    assert(!names.has(dish.name), `${category.name} 有重复商品 ${dish.name}`);
    names.add(dish.name);
    assert.strictEqual(dish.sort, (dishIndex + 1) * 10);
    assert.strictEqual(dish.price, null);
    assert.strictEqual(dish.cover, '');
    assert.deepStrictEqual(dish.images, []);
    assert(dish.description && dish.tags.length && dish.estimatedTime && dish.servingSize);
    assert(dish.ingredients.length >= 3 && dish.steps.length >= 4, dish.name);
    assert(dish.tips, dish.name);
    dish.ingredients.forEach(item => assert(item.id && item.name && item.amount !== undefined));
    dish.steps.forEach((step, index) => {
      assert(step.id && step.description && step.image === '');
      assert.strictEqual(step.stepNumber, index + 1);
    });
    if (dish.type === 'drink') {
      assert.deepStrictEqual(dish.mealRoles, ['drink']);
      assert.deepStrictEqual(dish.availableTastePreferences, []);
      assert.deepStrictEqual(dish.availableCustomRequests, []);
      assert(!Object.prototype.hasOwnProperty.call(dish, 'availableIceLevels'));
    } else {
      assert.deepStrictEqual(dish.availableCupSizes, []);
    }
    const normalized = dishForWrite({ ...dish, categoryId: category.id }, category);
    assert.strictEqual(normalized.price, null);
    assert.strictEqual(normalized.cover, '');
    assert.strictEqual(normalized.steps.length, dish.steps.length);
  });
});
assert.strictEqual(total, 76);

const emptyPlan = prepareMenuSeedPlan([], []);
assert.strictEqual(emptyPlan.summary.categoriesToCreate, 14);
assert.strictEqual(emptyPlan.summary.dishesToCreate, 76);
assert.strictEqual(emptyPlan.summary.targetFood, 64);
assert.strictEqual(emptyPlan.summary.targetDrink, 12);
assert.deepStrictEqual(emptyPlan.summary.conflicts, []);

const existingCategories = emptyPlan.categoriesToCreate.map(category => ({
  _id: category.id, name: category.name, type: category.type,
  icon: 'cloud://keep-icon', image: 'cloud://keep-image', iconImage: 'cloud://keep-icon-image',
  sort: category.sort, enabled: true, createdAt: 'old-time',
}));
const existingDishes = emptyPlan.dishesToCreate.map(dish => ({
  _id: dish.id, ...dish, price: 28, cover: 'cloud://keep-cover',
  images: ['cloud://keep-gallery'], createdAt: 'old-time',
}));
const repeatPlan = prepareMenuSeedPlan(existingCategories, existingDishes);
assert.strictEqual(repeatPlan.summary.categoriesToCreate, 0);
assert.strictEqual(repeatPlan.summary.dishesToCreate, 0);
assert.strictEqual(repeatPlan.summary.recipesToBackfill, 0);
assert.strictEqual(repeatPlan.summary.dishesSkipped, 76);

const oneMissingRecipe = { ...existingDishes[0], ingredients: [], steps: [], tips: '' };
const protectPlan = prepareMenuSeedPlan(existingCategories, [oneMissingRecipe, ...existingDishes.slice(1)]);
assert.strictEqual(protectPlan.summary.recipesToBackfill, 1);
assert.deepStrictEqual(Object.keys(protectPlan.recipesToBackfill[0].patch).sort(), ['ingredients', 'steps', 'tips']);
assert.strictEqual(oneMissingRecipe.cover, 'cloud://keep-cover');
assert.strictEqual(oneMissingRecipe.price, 28);

const legacyRecipe = { ...oneMissingRecipe, legacyIngredients: '鸡翅 500g', legacySteps: '先煎鸡翅' };
const legacyPlan = prepareMenuSeedPlan(existingCategories, [legacyRecipe, ...existingDishes.slice(1)]);
assert.deepStrictEqual(Object.keys(legacyPlan.recipesToBackfill[0].patch), ['tips']);

const oldCategory = { _id: existingCategories[0]._id, name: existingCategories[0].name,
  itemType: 'food', icon: 'cloud://keep-icon', image: 'cloud://keep-image', createdAt: 'old-time' };
const backfillPlan = prepareMenuSeedPlan([oldCategory, ...existingCategories.slice(1)], existingDishes);
assert.deepStrictEqual(backfillPlan.categoriesToBackfill[0].patch, { type: 'food', sort: 10, enabled: true });
assert(!Object.prototype.hasOwnProperty.call(backfillPlan.categoriesToBackfill[0].patch, 'icon'));

const wrongType = { ...existingCategories[0], type: 'drink' };
const conflictPlan = prepareMenuSeedPlan([wrongType, ...existingCategories.slice(1)], existingDishes);
assert(conflictPlan.summary.conflicts.length > 0);

console.log('menu-seed-v1: 14 categories, 76 dishes, schema and idempotency checks passed');
