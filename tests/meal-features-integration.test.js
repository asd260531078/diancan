const assert = require('assert');
const fs = require('fs');
const path = require('path');

let storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
};

const cartService = require('../services/cart');
const { normalizeMealRoles } = require('../config/meal-roles');
const {
  buildMealCandidates,
  generateCategoryGuidedMeal,
  getEligibleDrinkCategories,
  getEligibleFoodCategories,
} = require('../package-extra/utils/meal-random');
const {
  cancelMealBatch,
  createMealBatch,
  getMealBatchSelections,
  recordMealBatchSelection,
} = require('../package-extra/utils/meal-batch');
const { decorateMealSet } = require('../package-extra/utils/meal-set');

const categories = [
  { id: 'main', name: '主菜', type: 'food', enabled: true, sort: 1 },
  { id: 'soup', name: '汤', type: 'food', enabled: true, sort: 2 },
  { id: 'dessert', name: '甜品', type: 'food', enabled: true, sort: 3 },
  { id: 'empty', name: '空分类', type: 'food', enabled: true, sort: 4 },
  { id: 'coffee', name: '咖啡', type: 'drink', enabled: true, sort: 5 },
  { id: 'juice', name: '果汁', type: 'drink', enabled: true, sort: 6 },
  { id: 'disabled-category', name: '停用分类', type: 'food', enabled: false, sort: 7 },
];

const dishes = [
  {
    id: 'main-a', name: '辣椒炒肉', type: 'food', categoryId: 'main', price: 20,
    enabled: true, availableToday: true, soldOut: false,
    availableTastePreferences: ['少辣', '正常辣'], availableCustomRequests: ['免葱'],
  },
  { id: 'main-b', name: '可乐鸡翅', type: 'food', categoryId: 'main', price: 25, enabled: true, availableToday: true, soldOut: false },
  { id: 'soup-a', name: '紫菜蛋花汤', type: 'food', categoryId: 'soup', price: 8, enabled: true, availableToday: true, soldOut: false },
  { id: 'soup-b', name: '番茄汤', type: 'food', categoryId: 'soup', price: 9, enabled: true, availableToday: true, soldOut: false },
  { id: 'dessert-a', name: '提拉米苏', type: 'food', categoryId: 'dessert', price: null, enabled: true, availableToday: true, soldOut: false },
  {
    id: 'coffee-a', name: '冰美式', type: 'drink', categoryId: 'coffee', price: 15,
    enabled: true, availableToday: true, soldOut: false,
    availableCupSizes: ['中杯500ml'], availableSugarLevels: ['半甜', '不另外加糖'],
    availableTemperatures: ['去冰'], availableSweetenerTypes: [], availableToppings: [],
  },
  { id: 'coffee-b', name: '拿铁', type: 'drink', categoryId: 'coffee', price: 18, enabled: true, availableToday: true, soldOut: false },
  { id: 'juice-sold', name: '果汁', type: 'drink', categoryId: 'juice', price: 12, enabled: true, availableToday: true, soldOut: true },
  { id: 'disabled-dish', name: '下架菜', type: 'food', categoryId: 'main', price: 11, enabled: false, availableToday: true, soldOut: false },
  { id: 'disabled-category-dish', name: '分类停用菜', type: 'food', categoryId: 'disabled-category', price: 10, enabled: true, availableToday: true, soldOut: false },
];

// 1/2. 真实分类过滤与多 food category random。
assert.deepStrictEqual(getEligibleFoodCategories(dishes, categories).map(item => item.id), ['main', 'soup', 'dessert']);
assert.deepStrictEqual(getEligibleDrinkCategories(dishes, categories).map(item => item.id), ['coffee']);
for (let index = 0; index < 20; index += 1) {
  const randomValue = (index % 10) / 10;
  const result = generateCategoryGuidedMeal(
    dishes,
    categories,
    { foodCategoryIds: ['main', 'soup'], includeDrink: true, drinkCategoryId: 'coffee' },
    {},
    { random: () => randomValue },
  );
  assert.deepStrictEqual(result.foodItems.map(item => item.categoryId), ['main', 'soup']);
  assert.strictEqual(result.drink.categoryId, 'coffee');
  assert.strictEqual(result.items.length, 3);
}

// 3. 不喝饮品时不生成空饮品项；未标价不作为 0 元。
const unpricedRandom = generateCategoryGuidedMeal(
  dishes,
  categories,
  { foodCategoryIds: ['main', 'dessert'], includeDrink: false },
  {},
  { random: () => 0 },
);
assert.strictEqual(unpricedRandom.drink, null);
assert.strictEqual(unpricedRandom.items.length, 2);
assert.strictEqual(unpricedRandom.hasUnpricedItems, true);
assert.strictEqual(unpricedRandom.displayTotalAmount, 20);

// 4. 随机结果生成后商品状态改变，最新候选必须将其剔除。
const staleDishes = dishes.map(item => item.id === 'main-a' ? { ...item, soldOut: true } : item);
assert.strictEqual(buildMealCandidates(staleDishes, categories).some(item => item.id === 'main-a'), false);

// 5/6. random batch 完整配置后一次进入 cart；取消时返回空 selections。
let randomBatch = createMealBatch([dishes[0], dishes[2], dishes[5]]);
randomBatch = recordMealBatchSelection(randomBatch, { tastePreference: '少辣', customRequests: ['免葱'] });
randomBatch = recordMealBatchSelection(randomBatch, { tastePreference: '', customRequests: [] });
randomBatch = recordMealBatchSelection(randomBatch, {
  cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '去冰', sweetener: '', toppings: [],
});
assert.strictEqual(getMealBatchSelections(randomBatch).length, 3);
assert.deepStrictEqual(getMealBatchSelections(cancelMealBatch(createMealBatch([dishes[0], dishes[5]]))), []);

// 7/8/9. 套餐动态价格、未标价、数量和不可用状态。
const setBase = {
  id: 'set-a', name: '两人晚餐', enabled: true,
  items: [{ dishId: 'main-a', quantity: 1 }, { dishId: 'coffee-a', quantity: 2 }],
};
let decoratedSet = decorateMealSet(setBase, dishes, categories);
assert.strictEqual(decoratedSet.itemCount, 3);
assert.strictEqual(decoratedSet.displayTotalAmount, 50);
assert.strictEqual(decoratedSet.canOrder, true);
decoratedSet = decorateMealSet(setBase, dishes.map(item => item.id === 'main-a' ? { ...item, price: 25 } : item), categories);
assert.strictEqual(decoratedSet.displayTotalAmount, 55);
decoratedSet = decorateMealSet({ ...setBase, items: [...setBase.items, { dishId: 'dessert-a', quantity: 1 }] }, dishes, categories);
assert.strictEqual(decoratedSet.displayTotalText, '¥50 + 部分商品未标价');
for (const [changedDishes, changedCategories, expected] of [
  [dishes.map(item => item.id === 'main-a' ? { ...item, soldOut: true } : item), categories, '今日售罄'],
  [dishes.map(item => item.id === 'main-a' ? { ...item, availableToday: false } : item), categories, '今天不做'],
  [dishes.map(item => item.id === 'main-a' ? { ...item, enabled: false } : item), categories, '已下架'],
  [dishes, categories.map(item => item.id === 'main' ? { ...item, enabled: false } : item), '当前不可点'],
  [dishes.filter(item => item.id !== 'main-a'), categories, '商品已失效'],
]) {
  const result = decorateMealSet(setBase, changedDishes, changedCategories);
  assert.strictEqual(result.canOrder, false);
  assert.strictEqual(result.items[0].statusText, expected);
}

// 10. mealSet batch 保留数量；取消仍不产生半套。
let setBatch = createMealBatch([
  { dish: dishes[0], quantity: 1 },
  { dish: dishes[5], quantity: 2 },
]);
setBatch = recordMealBatchSelection(setBatch, { tastePreference: '少辣', customRequests: ['免葱'] });
setBatch = recordMealBatchSelection(setBatch, {
  cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '去冰', sweetener: '', toppings: [],
});
assert.deepStrictEqual(getMealBatchSelections(setBatch).map(item => item.quantity), [1, 2]);
assert.deepStrictEqual(getMealBatchSelections(cancelMealBatch(createMealBatch([{ dish: dishes[0], quantity: 1 }]))), []);

// 11/12/13. 普通菜单、随机、套餐最终都走同一 cartKey；同规格合并、不同规格拆分。
storage = {};
cartService.clearCart();
const drinkOptions = { cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '去冰', sweetener: '', toppings: [] };
cartService.addDish(dishes[5], drinkOptions, 1, { dishes });
cartService.addDishes([{ dish: dishes[5], selectedOptions: drinkOptions, quantity: 1 }], { dishes });
let cart = cartService.addDishes([{ dish: dishes[5], selectedOptions: { ...drinkOptions, toppings: [] }, quantity: 2 }], { dishes });
assert.strictEqual(cart.filter(item => item.dishId === 'coffee-a').length, 1);
assert.strictEqual(cart.find(item => item.dishId === 'coffee-a').quantity, 4);
cart = cartService.addDishes([{
  dish: dishes[5], quantity: 1,
  selectedOptions: { ...drinkOptions, cupSize: '大杯700ml' },
}], { dishes });
assert.strictEqual(cart.filter(item => item.dishId === 'coffee-a').length, 2);
cart = cartService.addDishes([{
  dish: dishes[5], quantity: 1,
  selectedOptions: { ...drinkOptions, sugarLevel: '不另外加糖' },
}], { dishes });
assert.strictEqual(cart.filter(item => item.dishId === 'coffee-a').length, 3);

storage = {};
cartService.clearCart();
const foodOptions = { tastePreference: '少辣', customRequests: ['免葱'] };
cartService.addDish(dishes[0], foodOptions, 1, { dishes });
cartService.addDishes([{ dish: dishes[0], selectedOptions: { tastePreference: '少辣', customRequests: ['免葱'] }, quantity: 1 }], { dishes });
cart = cartService.addDishes([{ dish: dishes[0], selectedOptions: { tastePreference: '正常辣', customRequests: ['免葱'] }, quantity: 1 }], { dishes });
assert.strictEqual(cart.length, 2);
assert.strictEqual(cart.find(item => item.selectedOptions.tastePreference === '少辣').quantity, 2);

// 14. 旧 dish 没有 mealRoles 仍按 categoryId 参与引导随机；role 不干扰分类筛选。
const legacyDish = { id: 'legacy-soup', name: '旧汤', type: 'food', categoryId: 'soup', enabled: true, availableToday: true, soldOut: false };
const legacyResult = generateCategoryGuidedMeal(
  [legacyDish, { ...dishes[0], mealRoles: ['main'] }],
  categories,
  { foodCategoryIds: ['soup'], includeDrink: false },
  {},
  { random: () => 0 },
);
assert.strictEqual(legacyResult.items[0].dish.id, 'legacy-soup');
assert.deepStrictEqual(normalizeMealRoles(undefined, 'food'), []);
assert.deepStrictEqual(normalizeMealRoles(['main'], 'drink'), ['drink']);

// 15. 较多分类和套餐仍一次批量处理，不依赖逐项请求。
const largeCategories = [
  ...Array.from({ length: 12 }, (_, index) => ({ id: `food-${index}`, name: `菜品${index}`, type: 'food', enabled: true, sort: index })),
  ...Array.from({ length: 12 }, (_, index) => ({ id: `drink-${index}`, name: `饮品${index}`, type: 'drink', enabled: true, sort: index })),
];
const largeDishes = largeCategories.map((category, index) => ({
  id: `large-dish-${index}`,
  name: `商品${index}`,
  type: category.type,
  categoryId: category.id,
  price: index + 1,
  enabled: true,
  availableToday: true,
  soldOut: false,
}));
assert.strictEqual(getEligibleFoodCategories(largeDishes, largeCategories).length, 12);
assert.strictEqual(getEligibleDrinkCategories(largeDishes, largeCategories).length, 12);
const largeMealSets = Array.from({ length: 12 }, (_, index) => decorateMealSet({
  id: `set-${index}`,
  name: `套餐${index}`,
  items: [{ dishId: `large-dish-${index}`, quantity: 1 }],
}, largeDishes, largeCategories));
assert.strictEqual(largeMealSets.length, 12);
assert.ok(largeMealSets.every(item => item.items.length === 1));

// 16. 新页面必须提供显式错误状态与重试，不把失败伪装为空数据。
const root = path.join(__dirname, '..');
for (const relativePath of [
  'package-extra/meal-random/meal-random.wxml',
  'package-extra/meal-sets/meal-sets.wxml',
  'package-extra/meal-set-detail/meal-set-detail.wxml',
]) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert.ok(source.includes('errorMessage'), `${relativePath} should render errorMessage`);
  assert.ok(source.includes('onRetryLoad'), `${relativePath} should expose retry`);
}

console.log('meal features integration tests passed');
