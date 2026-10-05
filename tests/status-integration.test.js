const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const menuJs = read('pages/menu/menu.js');
const menuWxml = read('pages/menu/menu.wxml');
const detailJs = read('package-extra/detail/detail.js');
const detailWxml = read('package-extra/detail/detail.wxml');
const manageJs = read('package-admin/manage/manage.js');
const manageWxml = read('package-admin/manage/manage.wxml');
const familyApi = read('cloudfunctions/familyApi/index.js');
const familySchema = read('cloudfunctions/familyApi/schema.js');

assert.ok(menuJs.includes("require('../../utils/dish-status')"));
assert.ok(menuWxml.includes('{{item.restrictionText}}'));
assert.ok(!menuWxml.includes("wx:if='{{item.soldOut}}'"), 'menu must not render a second sold-out branch');
assert.ok(!menuWxml.includes("wx:if='{{!item.availableToday}}'"), 'menu must not render a second today-unavailable branch');
assert.ok(menuWxml.includes('item.canAddToCart &&'), 'ordinary labels should only render while orderable');

assert.ok(detailJs.includes("require('../../utils/dish-status')"));
assert.ok(detailJs.includes("content: '该菜品已下架'"));
assert.ok(detailJs.includes('detailCanOrder: detailIsAdminPreview ? false : status.canOrder'));
assert.ok(detailWxml.includes('{{singleDish.restrictionText}}'));
assert.ok(detailWxml.includes('wx:if=\'{{singleDish.tags.length > 0}}\''));

assert.ok(manageJs.includes("['enabled', 'availableToday', 'soldOut']"));
assert.strictEqual((manageWxml.match(/bindchange="onToggleDishStatus"/g) || []).length, 3);
['enabled', 'availableToday', 'soldOut'].forEach(field => {
  assert.ok(manageWxml.includes(`data-field="${field}"`), `manage must expose ${field} quick status`);
});
assert.ok(manageWxml.includes('wx:if="{{!item.enabled}}"'));
assert.ok(manageWxml.includes('wx:elif="{{item.soldOut}}"'));
assert.ok(manageWxml.includes('wx:elif="{{!item.availableToday}}"'));

assert.ok(familyApi.includes('if (includeDisabled) await assertAdmin(openid);'));
assert.ok(familyApi.includes('items = items.filter(item => item.dish.enabled'));
assert.ok(familySchema.includes('function assertDishOrderable'));
assert.ok(familySchema.includes('dish.enabled !== false'));
assert.ok(familySchema.includes('dish.availableToday !== false'));
assert.ok(familySchema.includes('dish.soldOut !== true'));

console.log('status-integration tests passed');
