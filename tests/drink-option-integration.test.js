const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const componentJs = read('components/drink-option-sheet/index.js');
const componentWxml = read('components/drink-option-sheet/index.wxml');
const componentWxss = read('components/drink-option-sheet/index.wxss');
const sharedOptionsWxss = read('styles/spec-options.wxss');
const menuJs = read('pages/menu/menu.js');
const menuJson = read('pages/menu/menu.json');
const detailJs = read('package-extra/detail/detail.js');
const detailJson = read('package-extra/detail/detail.json');

assert.ok(componentJs.includes('initializeDrinkSelection'));
assert.ok(componentJs.includes('getDrinkSelectionView'));
assert.ok(componentJs.includes("this.triggerEvent('confirm'"));
assert.ok(componentWxml.includes('scroll-y'));
assert.ok(componentWxml.includes('{{summaryText'));
assert.ok(componentWxml.includes('disabled="{{!canConfirm}}"'));
assert.ok(componentWxml.includes('加入点菜单'));
assert.ok(componentWxss.includes('env(safe-area-inset-bottom)'));
assert.ok(componentWxss.includes('min-height: 0'));
assert.ok(componentWxss.includes('flex-direction: column'), 'footer actions must stack on narrow screens');
assert.ok(componentWxss.includes('.drink-confirm-button { display: block; width: 100%'), 'confirm button must remain full-width and visible');
assert.ok(componentWxss.includes('@import "../../styles/spec-options.wxss"'));
assert.ok(componentWxml.includes('spec-option-active'));
assert.ok(componentWxml.includes('quantity-stepper'));
assert.ok(componentWxml.includes('quantity-circle'));
assert.ok(sharedOptionsWxss.includes('.spec-option'));
assert.ok(sharedOptionsWxss.includes('border-radius: 12rpx'));
assert.ok(sharedOptionsWxss.includes('border-radius: 50%'), 'quantity +/- buttons must remain circular');
assert.ok(sharedOptionsWxss.includes('flex: 0 0 60rpx'), 'quantity buttons must not stretch');
assert.ok(sharedOptionsWxss.includes('max-width: 60rpx'), 'native buttons must have a hard maximum width');
assert.ok(sharedOptionsWxss.includes('width: 56rpx'), 'quantity value must stay compact');
assert.ok(componentWxss.includes('.drink-quantity { width: auto; max-width: 100%; align-self: flex-end; margin-left: auto; }'));

assert.ok(menuJson.includes('drink-option-sheet'));
assert.ok(detailJson.includes('drink-option-sheet'));
assert.ok(menuJs.includes('cartService.addDish'));
assert.ok(menuJs.includes('cartService.replaceItem'));
assert.ok(detailJs.includes('openDrinkOptionsFromDetail'));
assert.ok(detailJs.includes('cartService.addDish'));
assert.ok(!menuJs.includes("wx.setStorageSync('cart'"));
assert.ok(!detailJs.includes("wx.setStorageSync('cart'"));

console.log('drink option integration tests passed');
