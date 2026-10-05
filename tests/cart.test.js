const assert = require('assert');
const {
  MAX_QUANTITY,
  addItem,
  buildCartKey,
  canonicalizeSelectedOptions,
  clearCart,
  getItemCount,
  getTotalAmount,
  migrateLegacyCart,
  removeItem,
  updateQuantity,
} = require('../utils/cart');

function food(overrides = {}) {
  return {
    dishId: 'dish_food_1',
    name: '可乐鸡翅',
    type: 'food',
    cover: 'cloud://test/food.png',
    unitPrice: 20,
    quantity: 1,
    selectedOptions: { tastePreference: '', customRequests: [] },
    createdAt: 100,
    ...overrides,
  };
}

function drink(overrides = {}) {
  return {
    dishId: 'dish_drink_1',
    name: '百香果柠檬茶',
    type: 'drink',
    cover: 'cloud://test/drink.png',
    unitPrice: 16,
    quantity: 1,
    selectedOptions: {
      cupSize: '中杯500ml',
      sugarLevel: '半甜',
      temperature: '少冰',
      sweetener: '',
      toppings: [],
    },
    createdAt: 200,
    ...overrides,
  };
}

const canonicalDrink = canonicalizeSelectedOptions('drink', {
  toppings: [' 椰果 ', '珍珠', '椰果', ''],
  temperature: ' 少冰 ',
  sugarLevel: '半甜',
  cupSize: '中杯500ml',
});
assert.deepStrictEqual(canonicalDrink, {
  cupSize: '中杯500ml',
  sugarLevel: '半甜',
  temperature: '少冰',
  sweetener: '',
  toppings: ['椰果', '珍珠'].sort((a, b) => a.localeCompare(b, 'zh-CN')),
});

const firstKey = buildCartKey('dish_drink_1', 'drink', {
  cupSize: '中杯500ml', toppings: ['珍珠', '椰果'],
});
const reorderedKey = buildCartKey('dish_drink_1', 'drink', {
  toppings: ['椰果', '珍珠'], cupSize: '中杯500ml',
});
assert.strictEqual(firstKey, reorderedKey, 'option order must not change cartKey');

const firstFoodKey = buildCartKey('dish_food_1', 'food', {
  tastePreference: '少辣', customRequests: ['免蒜', '免葱'],
});
const reorderedFoodKey = buildCartKey('dish_food_1', 'food', {
  customRequests: ['免葱', '免蒜'], tastePreference: '少辣',
});
assert.strictEqual(firstFoodKey, reorderedFoodKey, 'custom request order must not change cartKey');

let items = addItem([], food());
assert.strictEqual(items.length, 1);
assert.strictEqual(items[0].quantity, 1);

items = addItem(items, food({ quantity: 2 }));
assert.strictEqual(items.length, 1, 'identical item must merge');
assert.strictEqual(items[0].quantity, 3);

items = addItem(items, drink());
items = addItem(items, drink({ selectedOptions: { cupSize: '中杯500ml', sugarLevel: '不另外加糖', temperature: '去冰', sweetener: '', toppings: [] } }));
assert.strictEqual(items.length, 3, 'different options must use separate cart rows');

items = addItem(items, drink({ selectedOptions: { cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '少冰', sweetener: '', toppings: ['珍珠', '椰果'] } }));
items = addItem(items, drink({ selectedOptions: { cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '少冰', sweetener: '', toppings: ['椰果', '珍珠'] } }));
assert.strictEqual(items.length, 4, 'equivalent unordered toppings must merge');
assert.strictEqual(items[3].quantity, 2);

const foodId = items[0].cartItemId;
items = updateQuantity(items, foodId, 5);
assert.strictEqual(items[0].quantity, 5);
items = updateQuantity(items, foodId, MAX_QUANTITY + 20);
assert.strictEqual(items[0].quantity, MAX_QUANTITY, 'quantity must be capped');
items = updateQuantity(items, foodId, 0);
assert.ok(!items.some(item => item.cartItemId === foodId), 'decreasing from one to zero removes the row');

const drinkId = items[0].cartItemId;
items = removeItem(items, drinkId);
assert.ok(!items.some(item => item.cartItemId === drinkId), 'remove must target one cart row');

assert.strictEqual(getItemCount([food({ quantity: 2 }), drink({ quantity: 3 })]), 5);
assert.strictEqual(getTotalAmount([food({ quantity: 2 }), drink({ quantity: 3 })]), 88);
assert.strictEqual(getTotalAmount([food({ unitPrice: null }), drink({ unitPrice: 'invalid' })]), 0);
assert.deepStrictEqual(clearCart(), []);

const legacyResult = migrateLegacyCart([
  { dishId: 'dish_food_1', name: '旧菜品', price: 18, num: 2 },
  { dishId: 'dish_drink_1', name: '旧饮品', price: 12, num: 1 },
  { dishId: '', name: '脏数据', num: -2 },
], {
  dishes: [
    { id: 'dish_food_1', name: '可乐鸡翅', type: 'food', price: 20, categoryId: 'cat_food' },
    { id: 'dish_drink_1', name: '百香果柠檬茶', type: 'drink', price: 16, availableSugarLevels: ['半甜'] },
  ],
});
assert.strictEqual(legacyResult.items.length, 1, 'unsafe legacy drink and invalid item must be ignored');
assert.strictEqual(legacyResult.items[0].type, 'food');
assert.strictEqual(legacyResult.items[0].quantity, 2);
assert.strictEqual(legacyResult.items[0].unitPrice, 20, 'legacy cart uses current dish price for display');
assert.strictEqual(legacyResult.warnings.length, 2);

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key] || ''; },
  setStorageSync(key, value) { storage[key] = value; },
};
const cartService = require('../services/cart');
storage.cart = [{ dishId: 'dish_food_1', name: '旧菜品', price: 18, num: 2 }];
let storedItems = cartService.loadCart({
  dishes: [{ id: 'dish_food_1', name: '可乐鸡翅', type: 'food', price: 20 }],
});
assert.strictEqual(storedItems.length, 1);
assert.strictEqual(storage.family_cart_v2.schemaVersion, 2);
storedItems = cartService.addItem(food());
assert.strictEqual(storedItems[0].quantity, 3);
assert.strictEqual(cartService.getItemCount(storedItems), 3);
assert.deepStrictEqual(cartService.clearCart(), []);
assert.deepStrictEqual(storage.family_cart_v2.items, []);

const drinkDish = { id: 'dish_drink_1', name: '百香果柠檬茶', type: 'drink', price: 16 };
storedItems = cartService.addDish(drinkDish, {
  cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '少冰', sweetener: '', toppings: [],
}, 1);
storedItems = cartService.addDish(drinkDish, {
  cupSize: '中杯500ml', sugarLevel: '不另外加糖', temperature: '去冰', sweetener: '', toppings: [],
}, 2);
assert.strictEqual(storedItems.length, 2);
storedItems = cartService.replaceItem(
  storedItems[0].cartItemId,
  drinkDish,
  { cupSize: '中杯500ml', sugarLevel: '不另外加糖', temperature: '去冰', sweetener: '', toppings: [] },
  1,
);
assert.strictEqual(storedItems.length, 1, 'editing to an existing cartKey must merge rows');
assert.strictEqual(storedItems[0].quantity, 3);

console.log('cart tests passed');
