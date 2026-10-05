const assert = require('assert');
const { getMenuSeedV1 } = require('../cloudfunctions/familyApi/data/menu-seed-v1');
const { getMenuSeedV2Additions } = require('../cloudfunctions/familyApi/data/menu-seed-v2-additions');
const { prepareMenuSeedPlan } = require('../cloudfunctions/familyApi/menu-seed-import');
const { dishForWrite } = require('../cloudfunctions/familyApi/schema');

const additions = getMenuSeedV2Additions();
const expected = [
  ['盖饭·定食', 'food', ['泰式打抛饭', '咖喱猪排饭']],
  ['粉·面', 'food', ['秘制麻辣烫']],
  ['热炒小菜', 'food', ['擂辣椒茄子皮蛋', '鲜香菇炒肉', '胡麻油炒鸡蛋', '豆角肉沫', '清炒时令蔬菜']],
  ['汤·羹', 'food', ['排骨玉米山药汤', '乌鸡药膳汤']],
  ['果茶', 'drink', ['鸭屎香手打柠檬茶', '红玉石榴']],
  ['奶茶', 'drink', ['青提冰奶']],
  ['奶昔·冰饮', 'drink', ['奇异果奶昔']],
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
  assert(item.description && item.tags.length && item.estimatedTime && item.servingSize);
  assert(item.ingredients.length >= 3 && item.steps.length >= 4 && item.tips);
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
}));
assert.strictEqual(food, 10);
assert.strictEqual(drink, 4);

const original = getMenuSeedV1();
const originalNames = new Set(original.flatMap(group => group.items.map(item => item.name)));
additions.forEach(group => group.items.forEach(item => assert(!originalNames.has(item.name))));
const categories = original.filter(group => group.name !== '鲜果汁').map(group => ({
  _id: group.id, name: group.name, type: group.type, sort: group.sort, enabled: true,
}));
const dishes = original.filter(group => group.name !== '鲜果汁').flatMap(group => group.items.map(item => ({
  _id: item.id, ...item, categoryId: group.id, price: 28,
  cover: 'cloud://keep-cover', images: ['cloud://keep-gallery'],
})));
const plan = prepareMenuSeedPlan(categories, dishes, { seed: 'v2-additions' });
assert.deepStrictEqual(plan.summary.conflicts, []);
assert.strictEqual(plan.summary.targetCategories, 7);
assert.strictEqual(plan.summary.targetDishes, 14);
assert.strictEqual(plan.summary.targetFood, 10);
assert.strictEqual(plan.summary.targetDrink, 4);
assert.strictEqual(plan.summary.dishesToCreate, 14);
assert.strictEqual(plan.summary.categoriesToCreate, 0);
assert.strictEqual(plan.summary.categoriesToBackfill, 0);
assert.strictEqual(plan.summary.recipesToBackfill, 0);
plan.dishesToCreate.forEach(dish => {
  const category = categories.find(item => item._id === dish.categoryId);
  assert(category);
  const priorSorts = dishes.filter(item => item.categoryId === dish.categoryId).map(item => item.sort);
  assert(dish.sort > Math.max(...priorSorts));
  assert.strictEqual(dish.price, null);
  assert.strictEqual(dish.cover, '');
  assert.deepStrictEqual(dish.images, []);
});
assert.deepStrictEqual(plan.dishesToCreate.filter(item => item.categoryName === '热炒小菜').map(item => item.sort),
  [90, 100, 110, 120, 130]);

const imported = plan.dishesToCreate.map(item => ({
  _id: item.id, ...item, price: 32, cover: 'cloud://manual-cover', images: ['cloud://manual-gallery'],
}));
const repeat = prepareMenuSeedPlan(categories, [...dishes, ...imported], { seed: 'v2-additions' });
assert.strictEqual(repeat.summary.dishesToCreate, 0);
assert.strictEqual(repeat.summary.recipesToBackfill, 0);
assert.strictEqual(repeat.summary.dishesReused, 14);

const incomplete = { ...imported[0], ingredients: [], steps: [], tips: '' };
const repair = prepareMenuSeedPlan(categories, [...dishes, incomplete, ...imported.slice(1)],
  { seed: 'v2-additions' });
assert.strictEqual(repair.summary.recipesToBackfill, 1);
assert.deepStrictEqual(Object.keys(repair.recipesToBackfill[0].patch).sort(), ['ingredients', 'steps', 'tips']);
assert.strictEqual(incomplete.price, 32);
assert.strictEqual(incomplete.cover, 'cloud://manual-cover');
assert.deepStrictEqual(incomplete.images, ['cloud://manual-gallery']);

const missingCategory = prepareMenuSeedPlan(categories.filter(item => item.name !== '果茶'), dishes,
  { seed: 'v2-additions' });
assert(missingCategory.summary.conflicts.some(message => message.includes('果茶')));
assert.strictEqual(missingCategory.summary.categoriesToCreate, 0);

console.log('menu-seed-v2-additions: 14 items, schema, existing-data protection, sort and idempotency checks passed');
