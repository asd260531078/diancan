const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  MAX_FOOD_CATEGORY_COUNT,
  generateCategoryGuidedMeal,
  getFoodCategoryMaxCount,
  normalizeCategoryGuidedSelection,
} = require('../package-extra/utils/meal-random');

const category = (id, type = 'food') => ({ id, name: id, type, enabled: true });
const dish = (id, categoryId, type = 'food', extra = {}) => ({
  id, name: id, categoryId, type, price: 10,
  enabled: true, availableToday: true, soldOut: false,
  ...extra,
});
const categories = [category('hot'), category('soup'), category('salad'), category('drink', 'drink')];
const dishes = [
  ...['A', 'B', 'C', 'D', 'E', 'F'].map(id => dish(id, 'hot')),
  dish('soup-1', 'soup'),
  dish('salad-1', 'salad'),
  dish('tea-1', 'drink', 'drink'),
  dish('tea-2', 'drink', 'drink'),
  dish('sold-out', 'hot', 'food', { soldOut: true }),
  dish('not-today', 'hot', 'food', { availableToday: false }),
  dish('disabled', 'hot', 'food', { enabled: false }),
];
const ids = result => result.foodItems.map(item => item.dish.id);
const selection = (foodCategoryIds, foodCategoryCounts = {}, includeDrink = false) => ({
  foodCategoryIds, foodCategoryCounts, includeDrink,
  drinkCategoryId: includeDrink ? 'drink' : '',
});
const deterministic = { random: () => 0 };

assert.strictEqual(MAX_FOOD_CATEGORY_COUNT, 5);
assert.deepStrictEqual(normalizeCategoryGuidedSelection(selection(['hot'])).foodCategoryCounts, { hot: 1 });
assert.deepStrictEqual(normalizeCategoryGuidedSelection(selection(['hot'], { hot: 3, stale: 4 })).foodCategoryCounts, { hot: 3 });
assert.deepStrictEqual(normalizeCategoryGuidedSelection(selection(['hot'], { hot: 99 })).foodCategoryCounts, { hot: 5 });
assert.strictEqual(getFoodCategoryMaxCount(dishes, categories, 'hot'), 5);
assert.strictEqual(getFoodCategoryMaxCount(dishes, categories, 'soup'), 1);

const defaultMeal = generateCategoryGuidedMeal(dishes, categories, selection(['hot']), {}, deterministic);
assert.deepStrictEqual(ids(defaultMeal), ['A']);
const three = generateCategoryGuidedMeal(dishes, categories, selection(['hot'], { hot: 3 }), {}, deterministic);
assert.deepStrictEqual(ids(three), ['A', 'B', 'C']);
assert.strictEqual(new Set(ids(three)).size, 3);
const five = generateCategoryGuidedMeal(
  dishes, categories, selection(['hot', 'soup', 'salad'], { hot: 3, soup: 1, salad: 1 }), {}, deterministic,
);
assert.deepStrictEqual(ids(five), ['A', 'B', 'C', 'soup-1', 'salad-1']);
assert.strictEqual(new Set(ids(five)).size, 5);

const shuffled = generateCategoryGuidedMeal(dishes, categories, selection(['hot'], { hot: 3 }), {
  foodDishByCategory: { hot: ids(three) },
}, deterministic);
assert.deepStrictEqual(ids(shuffled), ['D', 'E', 'F']);
const partial = generateCategoryGuidedMeal(dishes.filter(item => !['E', 'F'].includes(item.id)), categories,
  selection(['hot'], { hot: 3 }), { foodDishByCategory: { hot: ['A', 'B', 'C'] } }, deterministic);
assert.deepStrictEqual(ids(partial), ['D', 'A', 'B']);
const shortage = generateCategoryGuidedMeal([dish('only-1', 'hot'), dish('only-2', 'hot')], categories,
  selection(['hot'], { hot: 5 }), {}, deterministic);
assert.deepStrictEqual(ids(shortage), ['only-1', 'only-2']);
assert.deepStrictEqual(shortage.limitedFoodCategories.map(item => [item.id, item.actualCount]), [['hot', 2]]);
assert.strictEqual(getFoodCategoryMaxCount([dish('only-1', 'hot'), dish('only-2', 'hot')], categories, 'hot'), 2);

const duplicateSource = generateCategoryGuidedMeal([
  dish('shared', 'hot'), dish('shared', 'hot'), dish('unique', 'hot'),
  dish('shared', 'soup'), dish('soup-only', 'soup'),
], categories, selection(['hot', 'soup'], { hot: 2, soup: 1 }), {}, deterministic);
assert.deepStrictEqual(ids(duplicateSource), ['shared', 'unique', 'soup-only']);
assert.strictEqual(new Set(ids(duplicateSource)).size, 3);
const withDrink = generateCategoryGuidedMeal(dishes, categories,
  selection(['hot'], { hot: 3 }, true), {}, deterministic);
assert.strictEqual(withDrink.foodItems.length, 3);
assert.strictEqual(withDrink.items.length, 4);
assert.strictEqual(withDrink.items.filter(item => item.dish.type === 'drink').length, 1);

let storage = {};
const toasts = [];
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  showToast(options) { toasts.push(options); },
  navigateTo() {},
};
let pageDefinition;
global.Page = definition => { pageDefinition = definition; };
require('../package-extra/meal-random/meal-random');
function makePage(sourceDishes = dishes) {
  const page = {
    ...pageDefinition,
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (callback) callback();
    },
  };
  page.applyCatalog(sourceDishes, categories);
  page.fetchCatalog = async () => ({ dishes: sourceDishes, categories });
  return page;
}
const event = (categoryid, delta) => ({ currentTarget: { dataset: { categoryid, delta } } });

const page = makePage();
page.onFoodCategoryToggle(event('hot'));
assert.strictEqual(page.data.selectedFoodCategoryCounts.hot, 1);
assert.strictEqual(page.data.step, 'food-category');
page.onFoodCategoryCountChange(event('hot', 1));
page.onFoodCategoryCountChange(event('hot', 1));
assert.strictEqual(page.data.selectedFoodCategoryCounts.hot, 3);
assert.strictEqual(page.data.selectedFoodTotalCount, 3);
page.onRestartSelection();
assert.strictEqual(page.data.selectedFoodCategoryCounts.hot, 3);
page.onFoodCategoryToggle(event('hot'));
assert.deepStrictEqual(page.data.selectedFoodCategoryCounts, {});
page.onFoodCategoryToggle(event('hot'));
assert.strictEqual(page.data.selectedFoodCategoryCounts.hot, 1);
for (let index = 0; index < 10; index += 1) page.onFoodCategoryCountChange(event('hot', 1));
assert.strictEqual(page.data.selectedFoodCategoryCounts.hot, 5);
page.onFoodCategoryToggle(event('soup'));
page.onFoodCategoryCountChange(event('soup', 1));
assert.strictEqual(page.data.selectedFoodCategoryCounts.soup, 1);
page.onFoodCategoriesNext();
assert.strictEqual(page.data.step, 'drink-question');

const shufflePage = makePage();
shufflePage.onFoodCategoryToggle(event('hot'));
shufflePage.onFoodCategoryCountChange(event('hot', 1));
shufflePage.onFoodCategoryCountChange(event('hot', 1));
shufflePage.data.includeDrink = false;
shufflePage.generateForSelection(false);
const firstRound = new Set(shufflePage.data.mealItems.map(item => item.dish.id));
shufflePage.onShuffle();
assert.strictEqual(shufflePage.data.mealItems.length, 3);
assert.strictEqual(shufflePage.data.selectedFoodCategoryCounts.hot, 3);
assert.ok(shufflePage.data.mealItems.every(item => !firstRound.has(item.dish.id)));
shufflePage.onRestartSelection();
assert.strictEqual(shufflePage.data.step, 'food-category');
assert.strictEqual(shufflePage.data.selectedFoodCategoryCounts.hot, 3);

const shortagePage = makePage([dish('only-1', 'hot'), dish('only-2', 'hot')]);
shortagePage.onFoodCategoryToggle(event('hot'));
shortagePage.onFoodCategoryCountChange(event('hot', 1));
shortagePage.onFoodCategoryCountChange(event('hot', 1));
assert.strictEqual(shortagePage.data.selectedFoodCategoryCounts.hot, 2);
shortagePage.data.selectedFoodCategoryCounts.hot = 5;
shortagePage.generateForSelection(false);
assert.strictEqual(shortagePage.data.mealItems.length, 2);
assert.strictEqual(shortagePage.data.selectedFoodCategoryCounts.hot, 2);
assert.ok(toasts.some(item => item.title.includes('只有 2 道可选')));

async function testBatch() {
  storage = {};
  const acceptPage = makePage([dish('A', 'hot'), dish('B', 'hot'), dish('C', 'hot'), dish('tea', 'drink', 'drink')]);
  acceptPage.onFoodCategoryToggle(event('hot'));
  acceptPage.onFoodCategoryCountChange(event('hot', 1));
  acceptPage.onFoodCategoryCountChange(event('hot', 1));
  acceptPage.data.includeDrink = true;
  acceptPage.data.drinkCategoryId = 'drink';
  acceptPage.generateForSelection(false);
  assert.strictEqual(acceptPage.data.recommendedFoodCount, 3);
  await acceptPage.onAcceptMeal();
  assert.strictEqual(storage.family_cart_v2.items.length, 4);
  assert.ok(storage.family_cart_v2.items.every(item => item.quantity === 1));

  storage = {};
  const optionDishes = [
    dish('A', 'hot', 'food', { availableTastePreferences: ['少辣'] }),
    dish('B', 'hot'), dish('C', 'hot'),
  ];
  const cancelPage = makePage(optionDishes);
  cancelPage.onFoodCategoryToggle(event('hot'));
  cancelPage.onFoodCategoryCountChange(event('hot', 1));
  cancelPage.onFoodCategoryCountChange(event('hot', 1));
  cancelPage.data.includeDrink = false;
  cancelPage.generateForSelection(false);
  await cancelPage.onAcceptMeal();
  assert.strictEqual(cancelPage.data.batchActive, true);
  assert.strictEqual(cancelPage.data.foodOptionVisible, true);
  cancelPage.cancelCustomization();
  assert.strictEqual(cancelPage.data.batchActive, false);
  assert.deepStrictEqual(storage, {});
}

const wxml = fs.readFileSync(path.join(__dirname, '..', 'package-extra/meal-random/meal-random.wxml'), 'utf8');
assert.ok(wxml.includes('catchtap="onFoodCountControlTap"'));
assert.ok(wxml.includes('selectedFoodTotalCount'));
assert.ok(wxml.includes('recommendedFoodCount'));

testBatch().then(() => console.log('meal category counts tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
