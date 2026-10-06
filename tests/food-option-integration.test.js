const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const componentJs = read('components/food-option-sheet/index.js');
const componentWxml = read('components/food-option-sheet/index.wxml');
const componentWxss = read('components/food-option-sheet/index.wxss');
const sharedOptionsWxss = read('styles/spec-options.wxss');
const editJs = read('package-admin/dish-edit/dish-edit.js');
const editWxml = read('package-admin/dish-edit/dish-edit.wxml');
const menuJs = read('pages/menu/menu.js');
const menuWxml = read('pages/menu/menu.wxml');
const menuJson = read('pages/menu/menu.json');
const detailJs = read('package-extra/detail/detail.js');
const detailWxml = read('package-extra/detail/detail.wxml');
const detailJson = read('package-extra/detail/detail.json');
const serverSchema = read('cloudfunctions/familyApi/schema.js');

assert.ok(componentJs.includes('initializeFoodSelection'));
assert.ok(componentJs.includes("this.triggerEvent('confirm'"));
assert.ok(componentWxml.includes('加入点菜单'));
assert.ok(componentWxml.includes('disabled="{{!canConfirm}}"'));
assert.ok(componentWxml.includes('tasteOptions.length > 0'));
assert.ok(componentWxml.includes('requestOptions.length > 0'));
assert.ok(componentWxss.includes('env(safe-area-inset-bottom)'));
assert.ok(componentWxss.includes('.food-confirm-button { display: block; width: 100%'));
assert.ok(componentWxss.includes('@import "../../styles/spec-options.wxss"'));
assert.ok(componentWxml.includes('spec-option-active'));
assert.ok(componentWxml.includes('quantity-stepper'));
assert.ok(componentWxml.includes('quantity-circle'));
assert.ok(sharedOptionsWxss.includes('.spec-option'));
assert.ok(sharedOptionsWxss.includes('border-radius: 50%'));
assert.ok(sharedOptionsWxss.includes('flex: 0 0 60rpx'));
assert.ok(componentWxss.includes('.food-quantity { width: auto; max-width: 100%; align-self: flex-end; margin-left: auto; }'));

assert.ok(editJs.includes("require('../../config/food-options')"));
assert.ok(editWxml.includes('data-field="availableTastePreferences"'));
assert.ok(editWxml.includes('data-field="availableCustomRequests"'));
assert.ok(editJs.includes('onAddCustomFoodRequest'));
assert.ok(editJs.includes("availableTastePreferences: switchingToFood ? this.data.form.availableTastePreferences : []"));
assert.ok(editJs.includes("availableCustomRequests: base.type === 'food'"));

assert.ok(menuJson.includes('food-option-sheet'));
assert.ok(detailJson.includes('food-option-sheet'));
assert.ok(menuWxml.includes("bindconfirm='onFoodOptionsConfirm'"));
assert.ok(detailWxml.includes("bindconfirm='onFoodOptionsConfirm'"));
assert.ok(menuJs.includes('openFoodOptions(dish)'));
assert.ok(menuJs.includes('cartService.addDish'));
assert.ok(detailJs.includes('openFoodOptionsFromDetail'));
assert.ok(detailJs.includes('catalogService.peekDish(dish.id) || dish'), 'detail add re-checks the latest known status without refetching the menu');
assert.ok(!menuJs.includes("wx.setStorageSync('cart'"));
assert.ok(!detailJs.includes("wx.setStorageSync('cart'"));
assert.ok(serverSchema.includes("availableTastePreferences: type === 'food'"));
assert.ok(serverSchema.includes("availableCustomRequests: type === 'food'"));

console.log('food option integration tests passed');
