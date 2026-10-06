const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const theme = read('styles/theme.wxss');
const menu = read('pages/menu/menu.wxss');
const drink = read('components/drink-option-sheet/index.wxss');
const profile = read('pages/profile/profile.wxss');
const tab = read('components/custom-tab-bar/index.wxss');
// 木纹视觉已调整，不再用文本断言检查纹理写法；这里只保留主题色、布局和安全区约束。
['#F6F0E6', '#FFFCF7', '#E5D8C7', '#2B2119'].forEach(color => assert.ok(theme.includes(color)));
[menu, drink, profile, tab, read('app.wxss')].forEach(css => assert.ok(!/#(?:FF6347|E5533D|ef6a4c|d84c35|e45b3f)\b/i.test(css), '目标页面移除旧番茄色'));
assert.ok(menu.includes('width: 203rpx; height: 140rpx; flex: 0 0 203rpx'));
assert.strictEqual(203 / 140, 1.45);
assert.ok(menu.includes('font-size: 32rpx; line-height: 1.3; font-weight: 900'));
assert.ok(menu.includes('min-width: 0'));
assert.ok(menu.includes('-webkit-line-clamp: 2'));
assert.ok(drink.includes('.drink-sheet .spec-option-active'));
assert.ok(/\.drink-sheet \.spec-option-active\s*\{[^}]*color: #fff;/s.test(drink));
assert.ok(read('components/drink-option-sheet/index.wxml').includes('drink-sheet-layer brand-theme'));
assert.ok(drink.includes('env(safe-area-inset-bottom)'));
// 菜单底部安全区的具体数值由 bottom-safe-area.test.js 检查。
const config = JSON.parse(read('app.json'));
assert.strictEqual(config.window.navigationBarBackgroundColor, '#F6F0E6');
assert.strictEqual(config.window.navigationBarTextStyle, 'black');
console.log('theme layout tests passed');
