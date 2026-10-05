const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'pages/menu/menu.js'), 'utf8');
const wxml = fs.readFileSync(path.join(root, 'pages/menu/menu.wxml'), 'utf8');
const placeholder = '/images/default-dish.png';
let menu;
let revision = 0;
let dishRequests = 0;
let categoryRequests = 0;
let forbidImageCalls = false;
let now = 1;
const calls = { resolve: 0, project: 0, queue: 0, refresh: 0, invalidate: 0 };
const savedCovers = new Map();
const patches = [];
const categories = [
  { id: 'hot', name: '热炒小菜' }, { id: 'rice', name: '盖饭·定食' }, { id: 'soup', name: '汤·羹' },
];
const dishes = Array.from({ length: 60 }, (_, index) => ({
  id: `dish-${index}`, name: `${index % 3 === 0 ? '热炒' : index % 3 === 1 ? '盖饭' : '汤'}${index}`,
  categoryId: categories[index % 3].id, type: 'food', enabled: true, price: index,
  cover: `cloud://env/dish-${index}.png`, recommended: index === 0,
  ingredients: [{ name: '原料', quantity: '适量' }],
  steps: [{ text: '菜谱步骤'.repeat(1000), image: `cloud://env/step-${index}.png` }],
  images: [`cloud://env/detail-${index}.png`],
}));
const rawSnapshot = JSON.stringify(dishes);
savedCovers.set(dishes[0].cover, 'wxfile://usr/api-saved-first.png');

function recordImageCall(key) {
  assert.ok(!forbidImageCalls, `category tap must not call imageCache.${key}`);
  calls[key] += 1;
}
const imageCache = {
  getDisplayImage(value, fallback = placeholder) {
    recordImageCall('resolve');
    return savedCovers.get(value) || value || fallback;
  },
  setImageData(owner, data, callback, options) {
    recordImageCall('project');
    assert.strictEqual(options.queue, false);
    // Like the bridge, clone the initial payload. Category taps must keep these objects.
    const projected = JSON.parse(JSON.stringify(data));
    if (projected.categories) projected.categories.forEach(category => { category.cachedDisplayIcon = category.displayIcon; });
    owner.setData(projected);
    if (callback) callback();
  },
  queueCaches() { recordImageCall('queue'); }, queueCache() { recordImageCall('queue'); },
  refreshView() { recordImageCall('refresh'); }, invalidate() { recordImageCall('invalidate'); },
  releaseView() {}, imageEventHandlers: {},
};
vm.runInNewContext(source, {
  Page(config) { menu = config; }, getApp: () => ({ globalData: {} }),
  Date: { now: () => now }, console: { error() {} },
  wx: { getStorageSync: () => [], showToast() {} },
  require(name) {
    if (name === '../../services/imageCache') return imageCache;
    if (name === '../../services/catalog') return {
      getCachedCatalog: () => ({ dishes: [], categories: [] }), getCatalogRevision: () => revision,
      async listDishes() { dishRequests += 1; return { items: dishes }; },
      async listCategories() { categoryRequests += 1; return { items: categories }; },
    };
    if (name === '../../services/cart') return { loadCart: () => [], getItemCount: () => 0, getTotalAmount: () => 0 };
    return require(path.join(root, 'pages/menu', name));
  },
});
menu.setData = function (patch, callback) {
  patches.push(patch);
  Object.entries(patch).forEach(([key, value]) => {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    let object = this.data;
    parts.slice(0, -1).forEach(part => { object = object[part]; });
    object[parts[parts.length - 1]] = value;
  });
  if (callback) callback();
};
const tap = id => menu.onCategoryChange({ currentTarget: { dataset: { categoryid: id } } });
const panel = id => menu.data.categoryPanels.find(item => item.categoryId === id);

async function run() {
  menu.onLoad({ view: 'menu' });
  await menu.onShow();
  assert.strictEqual(dishRequests, 1);
  assert.strictEqual(categoryRequests, 1);
  assert.deepStrictEqual(Array.from(menu.data.categoryPanels.filter(item => item.visited), item => item.categoryId), ['all']);
  assert.strictEqual(menu._dishViewCache.size, 60);
  assert.strictEqual(menu._dishesByCategory.get('hot')[0], menu._dishViewCache.get('dish-0'));
  assert.strictEqual(panel('hot').dishes[0]._id, dishes[0].id, 'legacy id gets a stable view-only _id alias');
  assert.strictEqual(panel('hot').dishes[0].displayCover, savedCovers.get(dishes[0].cover));
  assert.ok(!('steps' in panel('hot').dishes[0]), 'panels must not duplicate recipe payloads');
  assert.ok(!('images' in panel('hot').dishes[0]), 'panels must not include detail galleries');
  assert.ok(menu.data.dishes[0].steps.length, 'full dish data remains available for existing business lookups');
  assert.strictEqual(JSON.stringify(dishes), rawSnapshot, 'the source menu data is not mutated');

  const originalPanels = menu.data.categoryPanels;
  const originalDishList = menu.data.dishes;
  const originalCache = menu._dishViewCache;
  const originalHotCards = panel('hot').dishes;
  const originalRiceCards = panel('rice').dishes;
  const originalHotCard = originalHotCards[0];
  const imageCallsBefore = { ...calls };
  // Background cache completion must not change a resident view's selected src.
  dishes.forEach(dish => savedCovers.set(dish.cover, `wxfile://usr/later-${dish.id}.png`));
  const originalFilter = menu.filterDishes;
  menu.filterDishes = () => { throw new Error('category tap must not filter/rebuild dishes'); };
  forbidImageCalls = true;
  for (const id of ['hot', 'rice', 'soup', 'hot', 'soup', 'rice', 'hot']) {
    const wasVisited = panel(id).visited;
    const before = patches.length;
    tap(id);
    assert.strictEqual(patches.length, before + 1);
    assert.deepStrictEqual(Object.keys(patches[before]).sort(), wasVisited
      ? ['activeCategoryId'] : ['activeCategoryId', `categoryPanels[${menu._panelIndexByCategory.get(id)}].visited`].sort());
  }
  const beforeSameTap = patches.length;
  tap('hot');
  tap('deleted-category');
  assert.strictEqual(patches.length, beforeSameTap, 'same/invalid category taps are no-ops');
  for (let index = 0; index < 50; index += 1) tap(['hot', 'rice', 'soup'][index % 3]);
  forbidImageCalls = false;
  menu.filterDishes = originalFilter;
  assert.deepStrictEqual(calls, imageCallsBefore, 'classification switching never resolves, queues, invalidates or refreshes images');
  assert.strictEqual(dishRequests, 1);
  assert.strictEqual(categoryRequests, 1);
  assert.strictEqual(menu.data.categoryPanels, originalPanels);
  assert.strictEqual(menu.data.dishes, originalDishList);
  assert.strictEqual(menu._dishViewCache, originalCache);
  assert.strictEqual(panel('hot').dishes, originalHotCards);
  assert.strictEqual(panel('rice').dishes, originalRiceCards);
  assert.strictEqual(panel('hot').dishes[0], originalHotCard);
  assert.strictEqual(originalHotCard.displayCover, 'wxfile://usr/api-saved-first.png');
  assert.strictEqual(panel('rice').dishes[0].displayCover, dishes[1].cover);
  assert.ok(menu.data.categoryPanels.every(item => item.visited), 'a visited flag never resets on switching');

  tap('hot');
  const searchCalls = { ...calls };
  const beforeSearch = patches.length;
  menu.onSearchInput({ detail: { value: '热炒0' } });
  assert.strictEqual(menu.activeDishes().length, 1);
  assert.ok(menu.activeDishes()[0].nameSegments.some(segment => segment.highlight));
  tap('rice');
  assert.strictEqual(menu.activeDishes().length, 0, 'search applies to the newly selected category too');
  menu.onSearchClear();
  assert.strictEqual(menu.activeDishes().length, 20);
  assert.strictEqual(panel('hot').dishes[0], originalHotCard);
  assert.strictEqual(panel('hot').dishes, originalHotCards);
  assert.deepStrictEqual(calls, searchCalls, 'search updates visibility/text only, not cache or image sources');
  patches.slice(beforeSearch).forEach(patch => {
    assert.ok(Object.keys(patch).every(key => !/displayCover|^dishes$|^categoryPanels$/.test(key)));
  });
  now += 24 * 60 * 60 * 1000;
  await menu.onShow();
  assert.strictEqual(dishRequests, 1, 'ordinary onShow after a long time does not re-fetch/rebuild the menu');
  assert.strictEqual(menu.data.categoryPanels, originalPanels);
  assert.strictEqual(panel('hot').dishes[0].displayCover, originalHotCard.displayCover);
  assert.strictEqual(calls.refresh, 0);

  await menu.retryCatalog();
  assert.strictEqual(dishRequests, 2, 'explicit refresh still fetches menu data');
  assert.strictEqual(menu.data.categoryPanels, originalPanels, 'unchanged data does not replace panels after a refresh');
  dishes[1] = { ...dishes[1], cover: 'cloud://env/new-cover.png', price: 8 };
  revision += 1;
  await menu.onShow();
  assert.strictEqual(dishRequests, 3, 'a catalog write revision is a valid reload trigger');
  assert.strictEqual(panel('rice').dishes[0].displayCover, dishes[1].cover, 'updated cover replaces the old image');
  assert.strictEqual(menu.data.dishes[1].price, 8, 'existing data-update behavior is preserved');
  assert.ok(panel('hot').visited && panel('rice').visited && panel('soup').visited);
  tap('soup');
  categories.pop();
  revision += 1;
  await menu.onShow();
  assert.strictEqual(menu.data.activeCategoryId, 'all', 'deleted active category falls back without editing dishes');
  assert.strictEqual(menu.activeDishes().length, 60);

  assert.ok(wxml.includes("wx:if='{{panel.visited}}'"));
  assert.ok(wxml.includes("hidden='{{activeCategoryId !== panel.categoryId}}'"));
  assert.ok(wxml.includes("wx:for='{{panel.dishes}}' wx:key='_id' hidden='{{item.searchHidden}}'"));
  assert.ok(!/wx:(?:if|elif)=['"][^'"]*activeCategoryId/.test(wxml), 'active selection may only hide, not unmount a panel');
  assert.ok(!wxml.includes('filteredDishes'));
  console.log('menu category residency passed: stable panels/keys/objects/src, no tap requests/cache work, first-visit mounting, search and revision refresh');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
