const assert = require('assert');
const {
  MAX_MEAL_SET_ITEMS,
  mealSetForWrite,
  publicMealSet,
} = require('../cloudfunctions/familyApi/meal-set-schema');

function valid(overrides = {}) {
  return {
    name: '两人晚餐',
    description: '两个人不知道吃什么，就吃这一套。',
    cover: '',
    tags: ['两人食', '晚餐'],
    items: [{ dishId: 'dish-a', quantity: 1 }, { dishId: 'dish-rice', quantity: 2 }],
    enabled: true,
    recommended: true,
    sort: 10,
    ...overrides,
  };
}

const normalized = mealSetForWrite(valid());
assert.strictEqual(normalized.name, '两人晚餐');
assert.deepStrictEqual(normalized.items, [{ dishId: 'dish-a', quantity: 1 }, { dishId: 'dish-rice', quantity: 2 }]);
assert.strictEqual(normalized.cover, '');
assert.strictEqual(normalized.recommended, true);
assert.throws(() => mealSetForWrite(valid({ items: null })), /必须是数组/);
assert.throws(() => mealSetForWrite(valid({ items: {} })), /必须是数组/);
assert.throws(() => mealSetForWrite(valid({ items: [] })), /至少需要 1 个/);
assert.throws(() => mealSetForWrite(valid({ items: Array.from({ length: MAX_MEAL_SET_ITEMS + 1 }, (_, index) => ({ dishId: `dish-${index}`, quantity: 1 })) })), /最多包含/);
assert.throws(() => mealSetForWrite(valid({ items: [{ dishId: 'dish-a', quantity: 0 }] })), /1～99/);
assert.throws(() => mealSetForWrite(valid({ items: [{ dishId: 'dish-a', quantity: -1 }] })), /1～99/);
assert.throws(() => mealSetForWrite(valid({ items: [{ dishId: 'dish-a', quantity: 1.5 }] })), /1～99/);
assert.throws(() => mealSetForWrite(valid({ items: [{ dishId: 'dish-a', quantity: 1 }, { dishId: 'dish-a', quantity: 2 }] })), /不能在套餐中重复/);
assert.throws(() => mealSetForWrite(valid({ name: '超'.repeat(31) })), /1～30/);
assert.throws(() => mealSetForWrite(valid({ description: '长'.repeat(201) })), /不能超过 200/);
assert.throws(() => mealSetForWrite(valid({ tags: Array.from({ length: 11 }, (_, index) => `标签${index}`) })), /最多 10/);
assert.throws(() => mealSetForWrite(valid({ cover: 'wxfile://temp.jpg' })), /云存储 fileID/);
assert.strictEqual(mealSetForWrite(valid({ cover: 'cloud://env/meal-sets/cover/a.jpg' })).cover, 'cloud://env/meal-sets/cover/a.jpg');

const publicSet = publicMealSet({ _id: 'set-a', ...valid(), enabled: false });
assert.strictEqual(publicSet.id, 'set-a');
assert.strictEqual(publicSet.enabled, false);

console.log('meal set schema tests passed');
