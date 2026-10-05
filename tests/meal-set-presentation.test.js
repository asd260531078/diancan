const assert = require('assert');
const { decorateMealSet } = require('../package-extra/utils/meal-set');

const categories = [
  { id: 'main', name: '主菜', type: 'food', enabled: true },
  { id: 'drink', name: '咖啡', type: 'drink', enabled: true },
  { id: 'off-cat', name: '停用分类', type: 'food', enabled: false },
];
const dishes = [
  { id: 'food', name: '辣椒炒肉', type: 'food', categoryId: 'main', price: 20, enabled: true, availableToday: true, soldOut: false },
  { id: 'drink', name: '冰美式', type: 'drink', categoryId: 'drink', price: 15, enabled: true, availableToday: true, soldOut: false },
  { id: 'unpriced', name: '今日甜品', type: 'food', categoryId: 'main', price: null, enabled: true, availableToday: true, soldOut: false },
  { id: 'sold', name: '售罄菜', type: 'food', categoryId: 'main', price: 8, enabled: true, availableToday: true, soldOut: true },
  { id: 'not-today', name: '今天不做', type: 'food', categoryId: 'main', price: 9, enabled: true, availableToday: false, soldOut: false },
  { id: 'disabled', name: '下架菜', type: 'food', categoryId: 'main', price: 10, enabled: false, availableToday: true, soldOut: false },
  { id: 'off-category', name: '分类停用菜', type: 'food', categoryId: 'off-cat', price: 11, enabled: true, availableToday: true, soldOut: false },
];

const base = { id: 'set', name: '套餐', items: [{ dishId: 'food', quantity: 2 }, { dishId: 'drink', quantity: 1 }], enabled: true };
let decorated = decorateMealSet(base, dishes, categories);
assert.strictEqual(decorated.canOrder, true);
assert.strictEqual(decorated.itemCount, 3);
assert.strictEqual(decorated.displayTotalAmount, 55);
assert.strictEqual(decorated.displayTotalText, '¥55');

decorated = decorateMealSet({ ...base, items: [...base.items, { dishId: 'unpriced', quantity: 1 }] }, dishes, categories);
assert.strictEqual(decorated.hasUnpricedItems, true);
assert.strictEqual(decorated.displayTotalText, '¥55 + 部分商品未标价');

const changedPrice = dishes.map(item => item.id === 'food' ? { ...item, price: 25 } : item);
decorated = decorateMealSet(base, changedPrice, categories);
assert.strictEqual(decorated.displayTotalAmount, 65);

for (const [dishId, expected] of [
  ['sold', '今日售罄'],
  ['not-today', '今天不做'],
  ['disabled', '已下架'],
  ['off-category', '当前不可点'],
  ['deleted', '商品已失效'],
]) {
  const result = decorateMealSet({ ...base, items: [{ dishId, quantity: 1 }] }, dishes, categories);
  assert.strictEqual(result.canOrder, false);
  assert.strictEqual(result.items[0].statusText, expected);
}

console.log('meal set presentation tests passed');
