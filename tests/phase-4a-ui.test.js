// 仅检查 4A 页面展示与现有入口的接线；不写云数据或真实本地购物车。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages/menu/menu.js'), 'utf8');
const wxml = fs.readFileSync(path.join(root, 'pages/menu/menu.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(root, 'pages/menu/menu.wxss'), 'utf8');
const status = require('../utils/dish-status');
const options = require('../utils/cart');
const images = require('../utils/detail-presentation');
const money = require('../utils/money');
let page;
let failed = false;
let dishRequests = 0;
let catalogRevision = 0;
let destinations = [];
let toasts = [];
const dishes = [
  { id: 'food', name: '可乐鸡翅', type: 'food', categoryId: 'main', price: 20, signature: true, recommended: true, tags: ['下饭'], availableTastePreferences: ['正常辣'] },
  { id: 'drink', name: '柠檬茶', type: 'drink', categoryId: 'drinks', price: null, recommended: true, availableCupSizes: ['中杯500ml'] },
  { id: 'plain', name: '清炒菜心', type: 'food', categoryId: 'main', price: 0 },
  { id: 'sold', name: '售罄饮品', type: 'drink', categoryId: 'drinks', soldOut: true, availableToday: false },
  { id: 'offToday', name: '今天不做', type: 'food', categoryId: 'main', availableToday: false },
];
const categories = [{ id: 'main', name: '家常拿手菜' }, { id: 'drinks', name: '饮品', icon: 'cloud://env/icon.png' }, { id: 'home', name: '家常', icon: 'home' }];
const catalog = {
  getCachedCatalog() { return { dishes: [], categories: [] }; },
  async listDishes() { dishRequests += 1; if (failed) throw new Error('test offline'); return { items: dishes }; },
  async listCategories() { return { items: categories }; },
  async loadCatalog() { dishRequests += 1; if (failed) throw new Error('test offline'); return { dishes, categories }; },
  getCatalogRevision() { return catalogRevision; },
};
vm.runInNewContext(source, {
  Page(config) { page = config; },
  getApp: () => ({ globalData: {} }),
  require(file) {
    const dependencies = {
      '../../config/menu-category-icons': require('../config/menu-category-icons'),
      '../../services/imageCache': {
        getDisplayImage(source, fallback = images.DEFAULT_COVER) { return source || fallback; },
        setImageData(owner, data, callback) {
          if (data.categories) data.categories = data.categories.map(item => ({ ...item, cachedDisplayIcon: item.displayIcon }));
          owner.setData(data);
          if (callback) callback();
        },
        queueCaches() {}, queueCache() {}, refreshView() {}, releaseView() {},
        handleImageError(owner, source, fallback) {
          const patch = {};
          for (const field of ['featuredDishes', 'previewDishes', 'popularDishes', 'searchResults']) {
            patch[field] = owner.data[field].map(item => (item.cover || item.image) === source ? { ...item, displayCover: fallback } : item);
          }
          patch.categoryPanels = owner.data.categoryPanels.map(panel => ({ ...panel,
            dishes: panel.dishes.map(item => (item.cover || item.image) === source ? { ...item, displayCover: fallback } : item) }));
          patch.categories = owner.data.categories.map(item => item.displayIcon === source ? { ...item, cachedDisplayIcon: fallback } : item);
          owner.setData(patch);
        },
      },
      '../../services/catalog': catalog,
      '../../services/orders': { peekFrequentDishIds: () => [], getFrequentDishIds: async () => [] },
      '../../services/cart': { loadCart: () => [], getItemCount: () => 0, getTotalAmount: () => 0 },
      '../../utils/dish-status': status,
      '../../utils/cart': options,
      '../../utils/money': money,
      '../../utils/detail-presentation': images,
    };
    assert.ok(Object.prototype.hasOwnProperty.call(dependencies, file), file);
    return dependencies[file];
  },
  wx: { getStorageSync: () => [], navigateTo: ({ url }) => destinations.push(url), showToast: data => toasts.push(data) },
  console: { error() {} },
});
page.setData = function (data) {
  Object.entries(data).forEach(([key, value]) => {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    let object = this.data;
    parts.slice(0, -1).forEach(part => { object = object[part]; });
    object[parts[parts.length - 1]] = value;
  });
};
const tap = dataset => ({ currentTarget: { dataset } });
const ids = items => Array.from(items, item => item.id);

(async () => {
  page.onLoad();
  await page.loadCatalog();
  assert.strictEqual(page.data.viewMode, 'home');
  assert.strictEqual(page.data.catalogLoading, false);
  assert.deepStrictEqual(ids(page.data.featuredDishes), ['food', 'drink']);
  assert.strictEqual(page.data.previewDishes.length, 4);
  assert.strictEqual(page.dishById('food').displayCover, images.DEFAULT_COVER);
  assert.strictEqual(page._dishes[1].price, null);
  assert.strictEqual(page._dishes[2].price, 0);
  assert.strictEqual(page.data.categories[3].displayIconText, '⌂');
  assert.strictEqual(page._dishes[3].restrictionText, '今日售罄');
  assert.strictEqual(page._dishes[4].restrictionText, '今天不做');
  const cachedDishes = page._dishes;
  await page.loadCatalog();
  assert.strictEqual(page._dishes, cachedDishes, '同样的云端数据不重新设置整批图片列表');
  const beforeQuickReturn = dishRequests;
  await page.onShow();
  assert.strictEqual(dishRequests, beforeQuickReturn, '短时间返回菜单不重新请求云端');
  catalogRevision += 1;
  await page.onShow();
  assert.strictEqual(dishRequests, beforeQuickReturn + 1, '本机管理修改后立即重新检查云端');
  page.goAllMenu();
  assert.strictEqual(page.data.viewMode, 'menu');
  page.onCategoryChange(tap({ categoryid: 'drinks' }));
  assert.deepStrictEqual(ids(page.activeDishes()), ['drink', 'sold']);
  assert.strictEqual(page.data.categoryPanels.find(panel => panel.categoryId === 'drinks').name, '饮品');
  page.onSearchInput({ detail: { value: '柠檬' } });
  assert.deepStrictEqual(ids(page.activeDishes()), ['drink']);
  assert.ok(page.activeDishes()[0].nameSegments.some(part => part.highlight));
  page.onSearchClear();
  page.goDetail(tap({ dishid: 'drink' }));
  page.goMealRandom();
  page.goMealSets();
  assert.deepStrictEqual(destinations, ['/package-extra/detail/detail?dishid=drink', '/package-extra/meal-random/meal-random', '/package-extra/meal-sets/meal-sets']);

  const actions = [];
  page.openFoodOptions = dish => actions.push('food-sheet:' + dish.id);
  page.openDrinkOptions = dish => actions.push('drink-sheet:' + dish.id);
  page.addFoodToCart = dish => actions.push('food-add:' + dish.id);
  page.addDrinkToCart = dish => actions.push('drink-add:' + dish.id);
  ['food', 'drink', 'plain', 'sold', 'offToday', 'missing'].forEach(id => page.addToCart(tap({ dish: { id } })));
  assert.deepStrictEqual(actions, ['food-sheet:food', 'drink-sheet:drink', 'food-add:plain']);
  assert.strictEqual(toasts.length, 3, '售罄、今天不做、已下架都走原拒绝逻辑');
  // 失效分类仅回退 UI，不修改菜品归属。
  page.data.activeCategoryId = 'removed-category';
  await page.loadCatalog();
  assert.strictEqual(page.data.activeCategoryId, 'all');
  assert.strictEqual(dishes[0].categoryId, 'main');
  page._dishes[0].displayCover = 'cloud://test/missing.png';
  page.onDishImageError(tap({ dishid: 'food' }));
  assert.strictEqual(page.data.featuredDishes[0].displayCover, images.DEFAULT_COVER);
  assert.strictEqual(page.data.previewDishes[0].displayCover, images.DEFAULT_COVER);
  assert.strictEqual(page.activeDishes()[0].displayCover, images.DEFAULT_COVER);
  page.onCategoryIconError(tap({ categoryid: 'drinks' }));
  assert.strictEqual(page.data.categories[2].cachedDisplayIcon, '');
  failed = true;
  await page.loadCatalog();
  assert.strictEqual(page.data.catalogLoading, false);
  assert.strictEqual(page.data.catalogError, true);
  assert.strictEqual(page._dishes.length, 5, '刷新失败不清空已有菜单');
  failed = false;
  dishes.splice(0);
  await page.loadCatalog();
  assert.strictEqual(page.data.featuredDishes.length, 0);
  assert.strictEqual(page.activeDishes().length, 0);
  page.onLoad({ searchKey: '%E8%8C%B6' });
  assert.strictEqual(page.data.searchKey, '茶');
  assert.strictEqual(page.data.viewMode, 'menu');

  assert.ok(wxml.includes("<template name=\"dishCard\">"));
  assert.strictEqual((wxml.match(/template is='dishCard'/g) || []).length, 3);
  assert.ok(wxml.includes("disabled='{{!item.canAddToCart}}'"));
  assert.ok(wxml.includes("catchtap='addToCart'"));
  assert.ok(wxml.includes("class='category-rail' scroll-y"));
  assert.ok(wxml.includes("class='menu-list-scroll' scroll-y"));
  assert.ok(wxss.includes('flex: 1; min-width: 0'));
  assert.ok(wxss.includes('calc(256rpx + env(safe-area-inset-bottom))'));
  assert.ok(wxss.includes('width: 156rpx; flex: 0 0 156rpx'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.deepStrictEqual(config.tabBar.list.map(item => item.pagePath), ['pages/menu/menu', 'pages/profile/profile']);
  console.log('phase 4A UI tests passed: home/menu/category/search/status/navigation/options/fallback/empty');
})().catch(error => { console.error(error); process.exitCode = 1; });
