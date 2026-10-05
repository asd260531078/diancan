const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wxml = read('pages/menu/menu.wxml');
const page = read('pages/menu/menu.js');
const { MENU_CATEGORY_ICONS, getMenuCategoryIcon } = require('../config/menu-category-icons');

assert.strictEqual(Object.keys(MENU_CATEGORY_ICONS).length, 13, 'all current menu categories need local icons');
assert.strictEqual(getMenuCategoryIcon({ name: '鲜果汁' }), '', 'deleted category should not be introduced');

assert.ok(wxml.includes("hidden='{{viewMode !== \"home\"}}'"));
assert.ok(wxml.includes("hidden='{{viewMode !== \"menu\"}}'"));
assert.ok(!wxml.includes("wx:if='{{viewMode === \"home\"}}'"));
assert.ok(wxml.includes("lazy-load='{{!item.eagerImage}}'"));
assert.ok(!wxml.includes("mode='aspectFit' lazy-load"), 'category icons must load eagerly');
assert.ok(!wxml.includes("wx:for='{{preloadImages}}'"), 'do not create hidden native cloud preloading images');
assert.ok(page.includes('const EAGER_MENU_IMAGE_COUNT = 8;'));
assert.ok(page.includes('imageCache.setImageData(this,'));
assert.ok(wxml.includes('{{item.displayCover}}'));
assert.ok(page.includes('signature === this._catalogSignature'), 'unchanged catalog must keep image data');
assert.ok(page.includes('{ queue: false }'), 'menu data projection must not queue the entire catalog');
assert.ok(page.includes('index < EAGER_MENU_IMAGE_COUNT'), 'first-entry background caching is limited to visible/next covers');
assert.ok(wxml.includes("bindload='onDishImageLoad'"), 'scroll-loaded covers join the same background queue');
assert.ok(!page.includes('imageCache.refreshView(this);'), 'onShow must not scan/resolve all image bindings');
assert.ok(!page.includes('await imageCache.'), 'menu rendering must never await image downloads');
assert.ok(wxml.includes("wx:for='{{categoryPanels}}'"));
assert.ok(wxml.includes("wx:key='categoryId'"));
assert.ok(wxml.includes("hidden='{{activeCategoryId !== panel.categoryId}}'"));
assert.ok(wxml.includes("wx:if='{{panel.visited}}'"), 'only first visits mount a panel');
assert.ok(wxml.includes("wx:for='{{panel.dishes}}' wx:key='_id'"), 'dish identity must be stable');
assert.ok(!wxml.includes('filteredDishes'), 'category taps must not replace a filtered list');
assert.ok(!page.includes('imageCache.refreshView('), 'mounted menu nodes must keep their src on re-entry');
const categoryHandler = page.slice(page.indexOf('  onCategoryChange(e)'), page.indexOf('  getHighlightSegments(dish)'));
['filterDishes(', 'loadCatalog(', 'resolveImage', 'queueCache', 'downloadFile', 'await '].forEach(call => {
  assert.ok(!categoryHandler.includes(call), `category taps must not call ${call}`);
});

for (const [name, icon] of Object.entries(MENU_CATEGORY_ICONS)) {
  assert.strictEqual(getMenuCategoryIcon({ name }), icon);
  assert.ok(fs.existsSync(path.join(root, icon.slice(1))), `${name} icon is missing`);
  assert.ok(fs.statSync(path.join(root, icon.slice(1))).size < 200 * 1024, `${name} icon is too large`);
}

console.log('menu image cache tests passed');
