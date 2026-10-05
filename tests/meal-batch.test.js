const assert = require('assert');

let stored = {};
global.wx = {
  getStorageSync(key) { return stored[key]; },
  setStorageSync(key, value) { stored[key] = value; },
};

const cartService = require('../services/cart');
const {
  cancelMealBatch,
  createMealBatch,
  currentMealBatchDish,
  getMealBatchSelections,
  isMealBatchComplete,
  recordMealBatchSelection,
} = require('../package-extra/utils/meal-batch');

const food = { id: 'food-1', name: '辣椒炒肉', type: 'food', price: 20, categoryId: 'food-cat' };
const drink = { id: 'drink-1', name: '冰美式', type: 'drink', price: 15, categoryId: 'drink-cat' };

let batch = createMealBatch([food, drink]);
assert.strictEqual(currentMealBatchDish(batch).id, 'food-1');
batch = recordMealBatchSelection(batch, { tastePreference: '少辣', customRequests: ['免葱'] });
batch = recordMealBatchSelection(batch, { cupSize: '中杯', sugarLevel: '半甜', temperature: '去冰', toppings: [] });
assert.strictEqual(isMealBatchComplete(batch), true);
assert.strictEqual(getMealBatchSelections(batch).length, 2);
assert.strictEqual(getMealBatchSelections(batch)[0].summaryText, '少辣 / 免葱');

const cancelled = cancelMealBatch(createMealBatch([food, drink]));
assert.deepStrictEqual(getMealBatchSelections(cancelled), []);

stored = {};
const selections = getMealBatchSelections(batch);
let cart = cartService.addDishes(selections, { dishes: [food, drink] });
assert.strictEqual(cart.length, 2);
assert.strictEqual(cartService.getItemCount(cart), 2);
cart = cartService.addDishes([selections[1]], { dishes: [food, drink] });
assert.strictEqual(cart.length, 2);
assert.strictEqual(cart.find(item => item.dishId === 'drink-1').quantity, 2);
cart = cartService.addDishes([{
  dish: drink,
  quantity: 1,
  selectedOptions: { cupSize: '大杯', sugarLevel: '不另外加糖', temperature: '去冰', toppings: [] },
}], { dishes: [food, drink] });
assert.strictEqual(cart.length, 3);

let quantityBatch = createMealBatch([{ dish: food, quantity: 2 }, { dish: drink, quantity: 3 }]);
quantityBatch = recordMealBatchSelection(quantityBatch, { tastePreference: '', customRequests: [] });
quantityBatch = recordMealBatchSelection(quantityBatch, { cupSize: '中杯', sugarLevel: '半甜', temperature: '去冰', toppings: [] });
assert.deepStrictEqual(getMealBatchSelections(quantityBatch).map(item => item.quantity), [2, 3]);

console.log('meal batch tests passed');
