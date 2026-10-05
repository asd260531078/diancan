const assert = require('assert');
const { getMenuSeedV1 } = require('../cloudfunctions/familyApi/data/menu-seed-v1');
const { getMenuSeedV2Additions } = require('../cloudfunctions/familyApi/data/menu-seed-v2-additions');
const { getMenuSeedV3Additions } = require('../cloudfunctions/familyApi/data/menu-seed-v3-additions');
const { prepareMenuSeedPlan } = require('../cloudfunctions/familyApi/menu-seed-import');
const { dishForWrite } = require('../cloudfunctions/familyApi/schema');

const additions = getMenuSeedV3Additions();
const expected = [
  ['热炒小菜', 'food', ['麻婆豆腐', '海皇粉丝啫啫煲', '小炒黄牛肉', '香酥大鲫鱼', '招牌下饭辣子鸡', '干锅花菜', '客家酿豆腐', '招牌酸菜鱼', '清蒸大闸蟹', '干锅土豆虾', '干锅手撕包菜', '菠萝咕咾肉']],
  ['凉菜·轻食', 'food', ['泰式捞汁三文鱼']],
  ['汤·羹', 'food', ['冬阴功海鲜汤']],
  ['粉·面', 'food', ['潮汕牛肉粿条', '港式云吞竹升面']],
  ['奶昔·冰饮', 'drink', ['西瓜椰椰']],
  ['奶茶', 'drink', ['黑糖珍珠鲜牛乳']],
  ['果茶', 'drink', ['椰青柠檬茶']],
];
assert.deepStrictEqual(additions.map(group => [group.name, group.type, group.items.map(item => item.name)]), expected);

const ids = new Set();
let food = 0;
let drink = 0;
additions.forEach(group => group.items.forEach(item => {
  assert(!ids.has(item.id), `重复 ID：${item.id}`);
  ids.add(item.id);
  if (item.type === 'food') food += 1;
  else drink += 1;
  assert.strictEqual(item.price, null);
  assert.strictEqual(item.cover, '');
  assert.deepStrictEqual(item.images, []);
  assert(item.description && item.tags.length && item.estimatedTime && item.servingSize && item.tips);
  assert(item.ingredients.length >= 3 && item.steps.length === 8);
  assert.deepStrictEqual([item.recommended, item.signature, item.availableToday, item.soldOut, item.enabled],
    [false, false, true, false, true]);
  item.steps.forEach((step, index) => {
    assert(step.id && step.description);
    assert.strictEqual(step.stepNumber, index + 1);
    assert.strictEqual(step.image, '');
  });
  const normalized = dishForWrite({ ...item, categoryId: 'existing-category' },
    { id: 'existing-category', name: group.name, type: group.type });
  assert.strictEqual(normalized.price, null);
  assert.strictEqual(normalized.cover, '');
  assert.deepStrictEqual(normalized.images, []);
  assert.strictEqual(normalized.ingredients.length, item.ingredients.length);
  assert.strictEqual(normalized.steps.length, 8);
}));
assert.strictEqual(food, 16);
assert.strictEqual(drink, 3);
assert.strictEqual(ids.size, 19);
assert(additions.find(group => group.name === '粉·面').items.some(item => item.name === '潮汕牛肉粿条'));
assert(additions.find(group => group.name === '热炒小菜').items.some(item => item.name === '海皇粉丝啫啫煲'));

const v1 = getMenuSeedV1();
const v2 = getMenuSeedV2Additions();
const categories = v1.map(group => ({
  _id: group.id, name: group.name, type: group.type, sort: group.sort, enabled: true,
}));
const categoryByName = new Map(categories.map(category => [category.name, category]));
const dishes = v1.flatMap(group => group.items.map(item => ({
  _id: item.id, ...item, categoryId: group.id, price: 28,
  cover: 'cloud://keep-cover', images: ['cloud://keep-gallery'],
})))
  .concat(v2.flatMap(group => group.items.map(item => ({
    _id: item.id, ...item, categoryId: categoryByName.get(group.name)._id, sort: 1000 + Number(item.id.slice(-2)),
    price: 30, cover: 'cloud://v2-cover', images: ['cloud://v2-gallery'],
  }))));
assert.strictEqual(dishes.length, 90);

const plan = prepareMenuSeedPlan(categories, dishes, { seed: 'v3-additions' });
assert.deepStrictEqual(plan.summary.conflicts, []);
assert.strictEqual(plan.summary.targetCategories, 7);
assert.strictEqual(plan.summary.targetDishes, 19);
assert.strictEqual(plan.summary.targetFood, 16);
assert.strictEqual(plan.summary.targetDrink, 3);
assert.strictEqual(plan.summary.dishesToCreate, 19);
assert.strictEqual(plan.summary.categoriesToCreate, 0);
assert.strictEqual(plan.summary.categoriesToBackfill, 0);
assert.strictEqual(plan.summary.recipesToBackfill, 0);
expected.forEach(([categoryName, , names]) => {
  const category = categoryByName.get(categoryName);
  const previousMax = Math.max(0, ...dishes.filter(item => item.categoryId === category._id)
    .map(item => Number(item.sort)).filter(Number.isFinite));
  const created = plan.dishesToCreate.filter(item => item.categoryId === category._id);
  assert.deepStrictEqual(created.map(item => item.name), names);
  assert.deepStrictEqual(created.map(item => item.sort), names.map((_, index) => previousMax + ((index + 1) * 10)));
});

const imported = plan.dishesToCreate.map(item => ({
  _id: item.id, ...item, price: 39, cover: 'cloud://manual-cover', images: ['cloud://manual-gallery'],
}));
const repeat = prepareMenuSeedPlan(categories, [...dishes, ...imported], { seed: 'v3-additions' });
assert.strictEqual(repeat.summary.dishesToCreate, 0);
assert.strictEqual(repeat.summary.recipesToBackfill, 0);
assert.strictEqual(repeat.summary.dishesReused, 19);
assert.strictEqual(repeat.summary.dishesSkipped, 19);

const manuallyEdited = {
  ...imported[0],
  price: 88,
  cover: 'cloud://user-cover',
  images: ['cloud://user-gallery'],
  description: '用户后来手工修改的描述',
  ingredients: [],
  steps: [],
  tips: '',
};
const protectedPlan = prepareMenuSeedPlan(categories,
  [...dishes, manuallyEdited, ...imported.slice(1)], { seed: 'v3-additions' });
assert.strictEqual(protectedPlan.summary.dishesToCreate, 0);
assert.strictEqual(protectedPlan.summary.recipesToBackfill, 0);
assert.strictEqual(manuallyEdited.price, 88);
assert.strictEqual(manuallyEdited.cover, 'cloud://user-cover');
assert.deepStrictEqual(manuallyEdited.images, ['cloud://user-gallery']);
assert.strictEqual(manuallyEdited.description, '用户后来手工修改的描述');

const missingCategory = prepareMenuSeedPlan(categories.filter(item => item.name !== '奶茶'), dishes,
  { seed: 'v3-additions' });
assert(missingCategory.summary.conflicts.some(message => message.includes('奶茶')));
assert.strictEqual(missingCategory.summary.categoriesToCreate, 0);

console.log('menu-seed-v3-additions: 19 items, schema, append sort, protection and idempotency checks passed');
