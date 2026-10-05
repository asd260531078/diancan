const assert = require('assert');
const { formatMoney } = require('../utils/money');
const {
  MAX_ORDER_NOTE_LENGTH,
  buildOrderDraft,
  createRequestId,
  validateCartAgainstDishes,
} = require('../package-order/utils/order-draft');

const now = new Date(2026, 8, 22, 10, 0, 0, 0).getTime();
const cart = [
  {
    cartItemId: 'cart_food', dishId: 'food_1', name: '辣椒炒肉', type: 'food',
    cover: 'cloud://test/food.jpg', unitPrice: 28, quantity: 1,
    selectedOptions: { tastePreference: '少辣', customRequests: ['免蒜', '免葱'] },
  },
  {
    cartItemId: 'cart_drink', dishId: 'drink_1', name: '百香果柠檬茶', type: 'drink',
    cover: 'cloud://test/drink.jpg', unitPrice: 20.25, quantity: 2,
    selectedOptions: {
      cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '少冰', sweetener: '蜂蜜', toppings: ['黑糖珍珠'],
    },
  },
];
const dishes = [
  {
    id: 'food_1', name: '辣椒炒肉', type: 'food', price: 28,
    enabled: true, availableToday: true, soldOut: false,
    availableTastePreferences: ['少辣', '正常辣'], availableCustomRequests: ['免葱', '免蒜'],
  },
  {
    id: 'drink_1', name: '百香果柠檬茶', type: 'drink', price: 20.25,
    enabled: true, availableToday: true, soldOut: false,
    availableCupSizes: ['中杯500ml'], availableSugarLevels: ['半甜'],
    availableTemperatures: ['少冰'], availableSweetenerTypes: ['蜂蜜'], availableToppings: ['黑糖珍珠'],
  },
];

const requestId = createRequestId(now, 0.5);
assert.strictEqual(requestId, createRequestId(now, 0.5), 'same submission context must reuse its requestId');
const draft = buildOrderDraft({
  cart,
  orderNote: '晚一点开始做',
  requestId,
  now,
});
assert.strictEqual(draft.itemCount, 3);
assert.strictEqual(draft.displayTotalAmount, 68.5);
assert.ok(!Object.prototype.hasOwnProperty.call(draft, 'mealTimeType'));
assert.ok(!Object.prototype.hasOwnProperty.call(draft, 'requestedMealTime'));
assert.strictEqual(draft.orderNote, '晚一点开始做');
assert.strictEqual(draft.items[0].summaryText, '少辣 / 免葱 / 免蒜');
cart[0].selectedOptions.customRequests.push('少油');
cart[0].name = '已修改';
assert.strictEqual(draft.items[0].name, '辣椒炒肉', 'draft item must be an explicit snapshot');
assert.deepStrictEqual(draft.items[0].selectedOptions.customRequests, ['免葱', '免蒜']);

assert.throws(() => buildOrderDraft({ cart: [], requestId, now }), /点菜单为空/);
assert.throws(() => buildOrderDraft({
  cart: draft.items,
  requestId,
  now,
  orderNote: 'a'.repeat(MAX_ORDER_NOTE_LENGTH + 1),
}), /不能超过 200 字/);
assert.throws(() => buildOrderDraft({
  cart: [{ ...draft.items[0], quantity: 0 }], requestId, now,
}), /数量无效/);

assert.strictEqual(validateCartAgainstDishes(draft.items, dishes).valid, true);
const soldOut = dishes.map(item => item.id === 'food_1' ? { ...item, soldOut: true } : item);
assert.match(validateCartAgainstDishes(draft.items, soldOut).issues[0].message, /辣椒炒肉今日售罄/);
const drinkChanged = dishes.map(item => item.id === 'drink_1' ? { ...item, availableSugarLevels: [] } : item);
assert.match(validateCartAgainstDishes(draft.items, drinkChanged).issues[0].message, /部分规格已发生变化/);
const foodChanged = dishes.map(item => item.id === 'food_1' ? { ...item, availableTastePreferences: ['正常辣'] } : item);
assert.match(validateCartAgainstDishes(draft.items, foodChanged).issues[0].message, /部分规格已发生变化/);
assert.match(validateCartAgainstDishes(draft.items, [dishes[1]]).issues[0].message, /已下架/);

assert.strictEqual(formatMoney(20), '20');
assert.strictEqual(formatMoney(20.5), '20.5');
assert.strictEqual(formatMoney(20.550000001), '20.55');

console.log('order draft tests passed');
