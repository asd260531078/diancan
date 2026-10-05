const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appWxss = read('app.wxss');
const tabBarWxss = read('components/custom-tab-bar/index.wxss');
const manageWxml = read('package-admin/manage/manage.wxml');
const manageWxss = read('package-admin/manage/manage.wxss');
const menuWxml = read('pages/menu/menu.wxml');
const menuWxss = read('pages/menu/menu.wxss');
const ordersWxml = read('package-order/orders/orders.wxml');
const profileWxml = read('pages/profile/profile.wxml');
const dishEditWxss = read('package-admin/dish-edit/dish-edit.wxss');
const categoryManageWxss = read('package-admin/category-manage/category-manage.wxss');
const detailWxss = read('package-extra/detail/detail.wxss');
const mealRandomWxss = read('package-extra/meal-random/meal-random.wxss');
const mealSetsWxss = read('package-extra/meal-sets/meal-sets.wxss');
const mealSetDetailWxss = read('package-extra/meal-set-detail/meal-set-detail.wxss');

assert.ok(appWxss.includes('.page.tab-page-safe'));
assert.ok(appWxss.includes('.container.tab-page-safe'));
assert.ok(appWxss.includes('calc(180rpx + env(safe-area-inset-bottom))'));

assert.ok(tabBarWxss.includes('.tab-bar-safe'));
assert.ok(tabBarWxss.includes('height: env(safe-area-inset-bottom)'));
assert.ok(!/\.tab-bar\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom\)/s.test(tabBarWxss));

assert.ok(manageWxml.includes('class="page tab-page-safe"'));
assert.ok(!manageWxss.includes('padding-bottom: 140rpx'));
assert.ok(menuWxml.includes('page tab-page-safe'));
assert.ok(menuWxml.includes('has-cart-bar'));
assert.ok(menuWxss.includes('bottom: calc(120rpx + env(safe-area-inset-bottom))'));
assert.ok(menuWxss.includes('calc(256rpx + env(safe-area-inset-bottom))'));
assert.ok(ordersWxml.includes('class="page"'));
assert.ok(!ordersWxml.includes('<custom-tab-bar />'));
assert.ok(profileWxml.includes('class="container tab-page-safe"'));

assert.ok(dishEditWxss.includes('height: calc(164rpx + env(safe-area-inset-bottom))'));
assert.ok(categoryManageWxss.includes('calc(56rpx + env(safe-area-inset-bottom))'));
assert.ok(detailWxss.includes('padding-bottom: calc(220rpx + env(safe-area-inset-bottom))'));
assert.ok(detailWxss.includes('padding-bottom: calc(30rpx + env(safe-area-inset-bottom))'));
assert.ok(mealRandomWxss.includes('calc(270rpx + env(safe-area-inset-bottom))'));
assert.ok(mealRandomWxss.includes('calc(16rpx + env(safe-area-inset-bottom))'));
assert.ok(mealSetsWxss.includes('env(safe-area-inset-bottom)'));
assert.ok(mealSetDetailWxss.includes('calc(170rpx + env(safe-area-inset-bottom))'));
assert.ok(mealSetDetailWxss.includes('calc(18rpx + env(safe-area-inset-bottom))'));

console.log('bottom safe-area tests passed');
