const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isPageRegistered } = require('./page-registration');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const familyApi = read('cloudfunctions/familyApi/index.js');
const categoryPage = read('package-admin/category-manage/category-manage.js');
const categoryView = read('package-admin/category-manage/category-manage.wxml');
const dishEdit = read('package-admin/dish-edit/dish-edit.js');
const menu = read('pages/menu/menu.js');
const appConfig = JSON.parse(read('app.json'));

assert.ok(isPageRegistered(appConfig, 'package-admin/category-manage/category-manage'), 'category-manage page must be registered');
assert.ok(familyApi.includes('async function assertUniqueCategoryName'), 'server must protect duplicate names');
assert.ok(familyApi.includes('async function findCategoryReferences'), 'server must count category references');
assert.ok(familyApi.includes("'CATEGORY_TYPE_IN_USE'"), 'server must reject incompatible type changes');
assert.ok(familyApi.includes('async function reorderCategories(event, openid)'), 'server must persist category order');
assert.ok(familyApi.includes('await assertAdmin(openid);'), 'server writes must check admin');
assert.ok(familyApi.includes('backfillMissing: true'), 'default seed must backfill missing fields');
assert.ok(categoryPage.includes('includeDisabled: true'), 'admin page must include disabled categories');
assert.ok(categoryPage.includes('catalogService.reorderCategories'), 'move actions must persist through service');
['onAdd', 'onEdit', 'onToggleEnabled', 'onMove', 'onDelete'].forEach(handler => {
  assert.ok(categoryView.includes(`bindtap="${handler}"`) || categoryView.includes(`bindchange="${handler}"`), `${handler} must be wired`);
});
assert.ok(dishEdit.includes('category.enabled !== false'), 'dish editor must exclude disabled categories');
assert.ok(dishEdit.includes('resolveCategorySelection'), 'type switch must resolve a compatible category consistently');
assert.ok(dishEdit.includes('categoryId: categorySelection.categoryId'), 'type switch must apply the resolved category');
assert.ok(menu.includes("const ALL_CATEGORY_ID = 'all'"), 'virtual all category must have a fixed ID');
assert.ok(menu.includes('activeCategoryId = categoryStillAvailable ? requestedCategoryId : ALL_CATEGORY_ID'), 'menu must fall back to all');
assert.ok(!menu.includes('updateDish('), 'menu fallback must not write dish category data');

console.log('category-management tests passed');
