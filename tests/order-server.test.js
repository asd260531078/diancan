const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertDishOrderable,
  assertOrderOwner,
  buildOrderDocumentId,
  buildOrderItem,
  buildOrderTotals,
  generateOrderNo,
  mergeEquivalentOrderItems,
  normalizeCreateOrderInput,
  normalizePageLimit,
  normalizePageOffset,
  validateDrinkOptions,
  validateFoodOptions,
  validateStatusTransition,
} = require('../cloudfunctions/familyApi/order-schema');
const orderService = require('../services/orders');

const drink = {
  id: 'drink_1',
  name: '百香果柠檬茶',
  type: 'drink',
  categoryId: 'cat_drink',
  cover: 'cloud://env/drinks/test.jpg',
  price: 20,
  enabled: true,
  availableToday: true,
  soldOut: false,
  availableCupSizes: ['中杯500ml'],
  availableSugarLevels: ['正常甜', '半甜', '不另外加糖'],
  availableTemperatures: ['少冰', '去冰'],
  availableSweetenerTypes: ['蜂蜜'],
  availableToppings: ['黑糖珍珠', '椰果'],
};
const food = {
  id: 'food_1',
  name: '可乐鸡翅',
  type: 'food',
  categoryId: 'cat_food',
  cover: '',
  price: null,
  enabled: true,
  availableToday: true,
  soldOut: false,
  availableTastePreferences: ['少辣'],
  availableCustomRequests: ['免葱', '免蒜'],
};
const enabledCategory = { id: 'cat', enabled: true };

const input = normalizeCreateOrderInput({
  requestId: 'order_test_001',
  orderNote: '饮品最后做',
  items: [{ dishId: drink.id, quantity: 2, selectedOptions: {
    cupSize: '中杯500ml', sugarLevel: '半糖', temperature: '少冰', sweetener: '蜂蜜', toppings: ['椰果', '黑糖珍珠'],
  } }],
});
assert.throws(() => normalizeCreateOrderInput(null), /必须是对象/);
assert.throws(() => normalizeCreateOrderInput([]), /必须是对象/);
assert.strictEqual(input.items[0].quantity, 2);
assert.throws(() => normalizeCreateOrderInput({ requestId: 'x', items: [{ dishId: 'a', quantity: '2' }] }), /数量/);
assert.throws(() => normalizeCreateOrderInput({ requestId: 'x', items: [] }), /点菜单为空/);
assert.throws(() => normalizeCreateOrderInput({ requestId: 'x', orderNote: 'a'.repeat(201), items: [{ dishId: 'a', quantity: 1 }] }), /200/);
for (const badRequestId of [null, 123, {}, [], true, 'x'.repeat(121), 'has space']) {
  assert.throws(() => normalizeCreateOrderInput({ requestId: badRequestId, items: [{ dishId: 'a', quantity: 1 }] }));
}
for (const badItems of [null, {}, 'dish', [], new Array(51).fill({ dishId: 'a', quantity: 1 })]) {
  assert.throws(() => normalizeCreateOrderInput({ requestId: 'valid_request', items: badItems }));
}
for (const badDishId of [null, 123, {}, [], '', 'x'.repeat(101)]) {
  assert.throws(() => normalizeCreateOrderInput({ requestId: 'valid_request', items: [{ dishId: badDishId, quantity: 1 }] }));
}
for (const badQuantity of [0, -1, 1.5, '2', 100, NaN, Infinity, null, {}, []]) {
  assert.throws(() => normalizeCreateOrderInput({ requestId: 'valid_request', items: [{ dishId: 'a', quantity: badQuantity }] }));
}
for (const badNote of [{}, [], 123, true]) {
  assert.throws(() => normalizeCreateOrderInput({ requestId: 'valid_request', orderNote: badNote, items: [{ dishId: 'a', quantity: 1 }] }));
}

assert.doesNotThrow(() => assertDishOrderable(drink, enabledCategory));
assert.throws(() => assertDishOrderable({ ...drink, soldOut: true }, enabledCategory), /已售罄/);
assert.throws(() => assertDishOrderable(drink, { enabled: false }), /分类已停用/);

const drinkOptions = validateDrinkOptions(drink, input.items[0].selectedOptions);
assert.strictEqual(drinkOptions.sugarLevel, '半甜');
assert.deepStrictEqual(drinkOptions.toppings, ['黑糖珍珠', '椰果']);
assert.throws(() => validateDrinkOptions(drink, { ...drinkOptions, cupSize: '特大杯9999ml' }), /杯型/);
assert.throws(() => validateDrinkOptions(drink, { ...drinkOptions, toppings: ['免费珍珠'] }), /小料/);
assert.throws(() => validateDrinkOptions(drink, { ...drinkOptions, unknown: 'hack' }), /不支持的规格字段/);
assert.throws(() => validateDrinkOptions(drink, { ...drinkOptions, cupSize: {} }), /必须是文本/);
assert.throws(() => validateDrinkOptions(drink, { ...drinkOptions, toppings: '黑糖珍珠' }), /必须是数组/);
assert.throws(() => validateDrinkOptions(drink, { ...drinkOptions, toppings: new Array(31).fill('黑糖珍珠') }), /最多选择 30/);

const foodOptions = validateFoodOptions(food, { tastePreference: '少辣', customRequests: ['免蒜', '免葱'] });
assert.deepStrictEqual(foodOptions.customRequests, ['免葱', '免蒜']);
assert.throws(() => validateFoodOptions(food, { tastePreference: '少辣', customRequests: ['免费加10份肉'] }), /不支持要求/);
assert.throws(() => validateFoodOptions(food, { tastePreference: [], customRequests: [] }), /必须是文本/);
assert.throws(() => validateFoodOptions(food, { tastePreference: '少辣', customRequests: {} }), /必须是数组/);

const pricedItem = buildOrderItem(drink, input.items[0]);
assert.strictEqual(pricedItem.unitPrice, 20);
assert.strictEqual(pricedItem.lineAmount, 40);
assert.strictEqual(pricedItem.summaryText, '中杯500ml / 半甜 / 少冰 / 蜂蜜 / 黑糖珍珠 / 椰果');
const unpricedItem = buildOrderItem(food, {
  quantity: 1,
  selectedOptions: { tastePreference: '少辣', customRequests: ['免葱'] },
});
assert.strictEqual(unpricedItem.unitPrice, null);
assert.strictEqual(unpricedItem.lineAmount, null);
assert.deepStrictEqual(buildOrderTotals([pricedItem, unpricedItem]), {
  itemCount: 3,
  totalAmount: 40,
  hasUnpricedItems: true,
});
assert.strictEqual(buildOrderTotals([
  { quantity: 1, lineAmount: 0.1 },
  { quantity: 1, lineAmount: 0.2 },
]).totalAmount, 0.3);

const duplicateDrinkItems = mergeEquivalentOrderItems([
  buildOrderItem(drink, { quantity: 1, selectedOptions: {
    cupSize: '中杯500ml', sugarLevel: '半甜', temperature: '少冰', sweetener: '蜂蜜', toppings: ['椰果', '黑糖珍珠'],
  } }),
  buildOrderItem(drink, { quantity: 2, selectedOptions: {
    cupSize: '中杯500ml', sugarLevel: '半糖', temperature: '少冰', sweetener: '蜂蜜', toppings: ['黑糖珍珠', '椰果', '椰果'],
  } }),
]);
assert.strictEqual(duplicateDrinkItems.length, 1);
assert.strictEqual(duplicateDrinkItems[0].quantity, 3);
assert.strictEqual(duplicateDrinkItems[0].lineAmount, 60);
assert.strictEqual(duplicateDrinkItems[0].orderItemId, 'item_1');

const sameId = buildOrderDocumentId('openid_a', 'request_a');
assert.strictEqual(sameId, buildOrderDocumentId('openid_a', 'request_a'));
assert.notStrictEqual(sameId, buildOrderDocumentId('openid_a', 'request_b'));
assert.notStrictEqual(sameId, buildOrderDocumentId('openid_b', 'request_a'));
assert.match(generateOrderNo('openid_a', 'request_a', Date.UTC(2026, 8, 22)), /^XG20260922-[A-F0-9]{6}$/);

assert.doesNotThrow(() => validateStatusTransition('pending', 'confirmed'));
assert.doesNotThrow(() => validateStatusTransition('confirmed', 'preparing'));
assert.doesNotThrow(() => validateStatusTransition('preparing', 'completed'));
assert.doesNotThrow(() => validateStatusTransition('preparing', 'cancelled'));
assert.throws(() => validateStatusTransition('completed', 'preparing'), /不能从/);
assert.throws(() => validateStatusTransition('cancelled', 'confirmed'), /不能从/);
assert.throws(() => validateStatusTransition('pending', 'pending'), /不能从/);
assert.throws(() => validateStatusTransition('confirmed', 'completed'), /不能从/);
assert.throws(() => validateStatusTransition('preparing', 'confirmed'), /不能从/);
assert.doesNotThrow(() => assertOrderOwner({ userOpenId: 'openid_a' }, 'openid_a'));
assert.throws(() => assertOrderOwner({ userOpenId: 'openid_a' }, 'openid_b'), /无权/);
assert.strictEqual(normalizePageLimit(undefined), 20);
assert.strictEqual(normalizePageLimit(100000), 20);
assert.strictEqual(normalizePageLimit(-1), 1);
assert.strictEqual(normalizePageLimit('bad'), 20);
assert.strictEqual(normalizePageOffset(undefined), 0);
assert.strictEqual(normalizePageOffset(-1), 0);
assert.strictEqual(normalizePageOffset(99999999), 10000);
assert.strictEqual(normalizePageOffset({}), 0);

const payload = orderService.buildCreateOrderPayload({
  requestId: 'order_test_001', orderNote: '备注', openid: 'other-user', userOpenId: 'admin-openid',
  owner: 'fake', status: 'completed', totalAmount: 0, createdAt: 'client-time', updatedAt: 'client-time',
  items: [{
    dishId: 'd1', quantity: 1, selectedOptions: {}, name: '免费豪华套餐', cover: 'https://evil.invalid/a.jpg',
    type: 'xxx', categoryId: 'fake-category', unitPrice: -999, lineAmount: 0, totalAmount: 999999,
  }],
});
assert.deepStrictEqual(payload, {
  requestId: 'order_test_001', orderNote: '备注',
  items: [{ dishId: 'd1', quantity: 1, selectedOptions: {} }],
});

const familyApi = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/familyApi/index.js'), 'utf8');
assert.ok(familyApi.includes('const { OPENID: openid } = cloud.getWXContext()'));
assert.ok(familyApi.includes("where({ userOpenId: openid })"), 'my orders must always filter current OPENID');
assert.ok(familyApi.includes("assertOrderOwner(order, openid, '无权查看此订单')"), 'detail must enforce ownership');
assert.ok(familyApi.includes("assertOrderOwner(order, openid, '无权取消此订单')"), 'cancel must enforce ownership');
assert.ok(familyApi.includes('async function listManageOrders(event, openid) {\n  await assertAdmin(openid);'));
assert.ok(familyApi.includes('async function updateOrderStatus(event, openid) {\n  await assertAdmin(openid);'));
assert.ok(familyApi.includes("status: 'pending'"));
assert.ok(!familyApi.includes("status: 'accepted'"));
assert.ok(familyApi.includes('createOrderOnce(db, documentId, data)'));
assert.ok(familyApi.includes('compareAndSetOrderStatus(db'));

console.log('order server tests passed');
