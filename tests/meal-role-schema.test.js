const assert = require('assert');
const {
  dishForWrite,
  publicDish,
} = require('../cloudfunctions/familyApi/schema');

const category = { id: 'cat-food', name: '主菜' };
const base = {
  name: '测试菜',
  type: 'food',
  categoryId: 'cat-food',
  price: null,
};

assert.deepStrictEqual(dishForWrite({ ...base, mealRoles: ['main', 'side', 'main'] }, category).mealRoles, ['main', 'side']);
assert.throws(() => dishForWrite({ ...base, mealRoles: ['unknown'] }, category), /未知餐食角色/);
assert.throws(() => dishForWrite({ ...base, mealRoles: ['drink'] }, category), /food 不能使用 drink/);
assert.deepStrictEqual(dishForWrite({ ...base, type: 'drink', mealRoles: ['main'] }, category).mealRoles, ['drink']);
assert.deepStrictEqual(publicDish({ ...base, id: 'old-food' }).mealRoles, []);
assert.deepStrictEqual(publicDish({ ...base, id: 'old-drink', type: 'drink' }).mealRoles, ['drink']);
assert.deepStrictEqual(dishForWrite({ ...base, type: 'drink', mealRoles: [] }, category).mealRoles, ['drink']);
assert.deepStrictEqual(dishForWrite({ ...base, type: 'food', mealRoles: [] }, category).mealRoles, []);

console.log('meal role schema tests passed');
