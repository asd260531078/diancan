const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const menuJs = fs.readFileSync(path.join(root, 'pages/menu/menu.js'), 'utf8');
const menuWxml = fs.readFileSync(path.join(root, 'pages/menu/menu.wxml'), 'utf8');

assert.ok(menuWxml.includes("wx:if='{{item.signature}}'"), 'menu must render signature state');
assert.ok(menuWxml.includes('>招牌</text>'), 'menu must show signature text');
assert.ok(menuWxml.includes("wx:if='{{item.recommended}}'"), 'menu must render recommended state');
assert.ok(menuWxml.includes('>推荐</text>'), 'menu must show recommended text');
assert.ok(menuWxml.includes('{{item.restrictionText}}'), 'menu must render the unified restriction text');
assert.ok(menuWxml.includes('item.restrictionKey === "soldOut"'), 'menu must style the sold-out priority state');
assert.ok(menuWxml.includes("wx:for='{{item.displayTags}}'"), 'menu must render custom tags');
assert.ok(!menuWxml.includes("class='popular-tag'>❤️"), 'heart must not replace status text');

assert.ok(menuJs.includes("mild: '🌶 微辣'"), 'menu must map mild spicy level');
assert.ok(menuJs.includes("medium: '🌶🌶 中辣'"), 'menu must map medium spicy level');
assert.ok(menuJs.includes("hot: '🌶🌶🌶 辣'"), 'menu must map hot spicy level');
assert.ok(menuJs.includes('.slice(0, 3)'), 'menu must limit custom tags to three');
assert.ok(menuJs.includes("require('../../utils/dish-status')"), 'menu must use the shared dish status rules');
assert.ok(menuJs.includes('getDishRestriction(dish)'), 'menu add action must recheck current dish status');
assert.ok(menuJs.includes('this.data.dishes.find'), 'cart plus action must resolve the current menu dish');

console.log('menu presentation tests passed');
