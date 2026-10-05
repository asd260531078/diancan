const assert = require('assert');
const {
  getFoodLineAmount,
  getFoodSelectionView,
  getMissingFoodSelections,
  getSupportedFoodOptions,
  initializeFoodSelection,
  selectTastePreference,
  toggleCustomRequest,
} = require('../utils/food-selection');
const {
  addItem,
  buildCartKey,
  buildSummaryText,
  hasFoodOptions,
} = require('../utils/cart');

const configurableDish = {
  id: 'food_1',
  type: 'food',
  name: '辣椒炒肉',
  price: 28,
  availableTastePreferences: ['不辣', '少辣', '正常辣', '少辣'],
  availableCustomRequests: ['免葱', '免蒜', '少油', '免葱'],
};

assert.deepStrictEqual(getSupportedFoodOptions(configurableDish), {
  tastePreferences: ['不辣', '少辣', '正常辣'],
  customRequests: ['免葱', '免蒜', '少油'],
});
assert.strictEqual(hasFoodOptions(configurableDish), true);
assert.strictEqual(hasFoodOptions({ type: 'food' }), false);

const initial = initializeFoodSelection(configurableDish);
assert.deepStrictEqual(initial, { tastePreference: '', customRequests: [] });
assert.strictEqual(getMissingFoodSelections(configurableDish, initial)[0].message, '请选择口味');
assert.strictEqual(getFoodSelectionView(configurableDish, initial).canConfirm, false);

const uniqueTaste = initializeFoodSelection({
  type: 'food',
  availableTastePreferences: ['少辣'],
  availableCustomRequests: [],
});
assert.strictEqual(uniqueTaste.tastePreference, '少辣', 'the only taste must be selected automatically');
assert.strictEqual(getMissingFoodSelections({ type: 'food', availableCustomRequests: ['免葱'] }, {}).length, 0);

let selected = selectTastePreference(configurableDish, initial, '少辣');
selected = toggleCustomRequest(configurableDish, selected, '免葱');
selected = toggleCustomRequest(configurableDish, selected, '免蒜');
assert.strictEqual(buildSummaryText('food', selected), '少辣 / 免葱 / 免蒜');
assert.strictEqual(getFoodSelectionView(configurableDish, selected).canConfirm, true);
selected = toggleCustomRequest(configurableDish, selected, '免蒜');
assert.strictEqual(buildSummaryText('food', selected), '少辣 / 免葱');
assert.strictEqual(getFoodLineAmount(28, 2), 56);

const keyA = buildCartKey('food_1', 'food', { tastePreference: '少辣', customRequests: ['免葱', '免蒜'] });
const keyB = buildCartKey('food_1', 'food', { tastePreference: '少辣', customRequests: ['免蒜', '免葱'] });
const keyC = buildCartKey('food_1', 'food', { tastePreference: '正常辣', customRequests: ['免葱'] });
assert.strictEqual(keyA, keyB, 'custom request order must not affect cartKey');
assert.notStrictEqual(keyA, keyC, 'different food requirements must split cart rows');

const item = options => ({
  dishId: 'food_1', name: '辣椒炒肉', type: 'food', unitPrice: 28, quantity: 1,
  selectedOptions: options,
});
let cart = addItem([], item({ tastePreference: '少辣', customRequests: ['免葱', '免蒜'] }));
cart = addItem(cart, item({ tastePreference: '少辣', customRequests: ['免蒜', '免葱'] }));
assert.strictEqual(cart.length, 1);
assert.strictEqual(cart[0].quantity, 2);
cart = addItem(cart, item({ tastePreference: '正常辣', customRequests: ['免葱'] }));
assert.strictEqual(cart.length, 2);

console.log('food selection tests passed');
