const assert = require('assert');
const {
  getDrinkSelectionView,
  getDrinkSpecGroups,
  getSupportedDrinkOptions,
  initializeDrinkSelection,
  isDrinkSelectionComplete,
  selectDrinkSingleOption,
  toggleDrinkTopping,
} = require('../utils/drink-selection');
const { addItem, hasDrinkOptions } = require('../utils/cart');

const drink = {
  id: 'drink_1',
  name: '百香果柠檬茶',
  type: 'drink',
  availableCupSizes: ['中杯500ml'],
  availableSugarLevels: ['正常糖', '半糖', '无糖'],
  availableTemperatures: ['去冰', '少冰', '正常冰'],
  availableSweetenerTypes: ['普通糖浆'],
  availableToppings: ['黑糖珍珠', '椰果', '芋圆'],
};

const supported = getSupportedDrinkOptions(drink);
assert.deepStrictEqual(supported.sugarLevel, ['正常甜', '半甜', '不另外加糖']);
assert.deepStrictEqual(supported.temperature, ['去冰', '少冰', '正常冰']);

const legacyInitial = initializeDrinkSelection(drink, { sugarLevel: '半糖' });
assert.strictEqual(legacyInitial.sugarLevel, '半甜', 'legacy selected sugar must map to the new label');

let selected = initializeDrinkSelection(drink);
assert.strictEqual(selected.cupSize, '中杯500ml', 'single cup size must auto-select');
assert.strictEqual(selected.sweetener, '普通糖浆', 'single sweetener must auto-select');
assert.strictEqual(selected.sugarLevel, '', 'multiple sugar levels must not auto-select');
assert.strictEqual(selected.temperature, '', 'multiple temperatures must not auto-select');
assert.deepStrictEqual(selected.toppings, []);
assert.strictEqual(isDrinkSelectionComplete(drink, selected), false);

selected = selectDrinkSingleOption(drink, selected, 'sugarLevel', '半甜');
selected = selectDrinkSingleOption(drink, selected, 'temperature', '少冰');
selected = toggleDrinkTopping(drink, selected, '椰果');
selected = toggleDrinkTopping(drink, selected, '黑糖珍珠');
assert.strictEqual(isDrinkSelectionComplete(drink, selected), true);

let view = getDrinkSelectionView(drink, selected);
assert.strictEqual(view.canConfirm, true);
assert.strictEqual(
  view.summaryText,
  ['中杯500ml', '半甜', '少冰', '普通糖浆', ...selected.toppings].join(' / '),
);
assert.deepStrictEqual(view.groups.map(group => group.key), [
  'cupSize', 'sugarLevel', 'temperature', 'sweetener', 'toppings',
]);

selected = toggleDrinkTopping(drink, selected, '椰果');
assert.ok(!selected.toppings.includes('椰果'), 'selected topping must be removable');

const americano = {
  id: 'drink_2',
  name: '冰美式',
  type: 'drink',
  availableCupSizes: ['中杯500ml', '大杯700ml'],
  availableSugarLevels: ['不另外加糖'],
  availableTemperatures: ['正常冰', '少冰', '去冰'],
  availableSweetenerTypes: [],
  availableToppings: [],
};
const americanoGroups = getDrinkSpecGroups(americano);
assert.deepStrictEqual(
  americanoGroups.map(group => group.key),
  ['cupSize', 'sugarLevel', 'temperature'],
  'empty sweetener and topping groups must be hidden',
);

const legacyDrink = { id: 'drink_legacy', name: '旧饮品', type: 'drink' };
assert.strictEqual(hasDrinkOptions(legacyDrink), false);
const legacySelection = initializeDrinkSelection(legacyDrink);
assert.strictEqual(isDrinkSelectionComplete(legacyDrink, legacySelection), true);
assert.strictEqual(getDrinkSelectionView(legacyDrink, legacySelection).summaryText, '');

let cart = addItem([], {
  dishId: drink.id,
  name: drink.name,
  type: 'drink',
  unitPrice: 16,
  quantity: 1,
  selectedOptions: selected,
});
cart = addItem(cart, {
  dishId: drink.id,
  name: drink.name,
  type: 'drink',
  unitPrice: 16,
  quantity: 1,
  selectedOptions: { ...selected, toppings: [...selected.toppings].reverse() },
});
assert.strictEqual(cart.length, 1, 'equivalent drink options must merge');
assert.strictEqual(cart[0].quantity, 2);

cart = addItem(cart, {
  dishId: drink.id,
  name: drink.name,
  type: 'drink',
  unitPrice: 16,
  quantity: 1,
  selectedOptions: { ...selected, sugarLevel: '不另外加糖' },
});
assert.strictEqual(cart.length, 2, 'different drink options must split');

console.log('drink selection tests passed');
