// 大菜单（1000 道）下首页首屏数据量与常点统计。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const categories = Array.from({ length: 20 }, (_, index) => ({ id: `c${index}`, name: `分类${index}` }));
const dishes = Array.from({ length: 1000 }, (_, index) => ({
  id: `d${index}`, name: `招牌菜${index}`, type: 'food', categoryId: `c${index % 20}`, enabled: true,
  price: index, cover: `cloud://env/d${index}.png`, description: '一句话简介'.repeat(4), tags: ['下饭', '家常'],
  availableTastePreferences: ['少辣', '正常'],
}));

let menu;
const patches = [];
vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/menu/menu.js'), 'utf8'), {
  Page(config) { menu = config; }, getApp: () => ({ globalData: {} }),
  console: { error() {}, log() {} },
  wx: { getStorageSync: () => [], showToast() {} },
  require(name) {
    if (name === '../../services/imageCache') return {
      imageEventHandlers: {}, releaseView() {}, queueCaches() {}, queueCache() {},
      getDisplayImage: value => value,
      setImageData(owner, patch) { owner.setData(patch); },
    };
    if (name === '../../services/catalog') return {
      getCachedCatalog: () => ({ dishes, categories }), getCatalogRevision: () => 0,
      async loadCatalog() { return { dishes, categories }; },
    };
    if (name === '../../services/cart') return { loadCart: () => [], getItemCount: () => 0, getTotalAmount: () => 0 };
    if (name === '../../services/orders') return { peekFrequentDishIds: () => ['d5', 'missing', 'd7'], getFrequentDishIds: async () => ['d5', 'd7'] };
    return require(path.join(root, 'pages/menu', name));
  },
});
menu.setData = function setData(patch) {
  patches.push(patch);
  Object.entries(patch).forEach(([key, value]) => {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    let target = this.data;
    parts.slice(0, -1).forEach(part => { target = target[part]; });
    target[parts[parts.length - 1]] = value;
  });
};

const started = Date.now();
menu.onLoad({ view: 'menu' });
const elapsed = Date.now() - started;
const initial = patches.find(patch => patch.categoryPanels);
const size = JSON.stringify(initial).length;
assert.ok(size < 64 * 1024, `first render payload must stay small with 1000 dishes (was ${size} bytes)`);
assert.ok(elapsed < 1500, `building the menu view must stay fast (was ${elapsed}ms)`);
assert.strictEqual(initial.dishCount, 1000);
assert.strictEqual(initial.categoryPanels[0].dishes.length, 20);
assert.ok(initial.categoryPanels.slice(1).every(panel => panel.dishes.length === 0));
assert.deepStrictEqual(Array.from(menu.data.popularDishes, item => item.id), ['d5', 'd7'], 'frequent dishes come from order history');

// 搜索 1000 道菜：只渲染第一页结果。
menu.onSearchInput({ detail: { value: '招牌菜1' } });
assert.strictEqual(menu.data.searchCount, 111);
assert.strictEqual(menu.data.searchResults.length, 30);

// 常点统计：排除已取消订单，按份数排序。
const ordersModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'services/orders.js'), 'utf8'), {
  module: ordersModule, require: () => ({ callFamilyApi() {} }),
});
const ids = ordersModule.exports.countFrequentDishIds([
  { status: 'completed', items: [{ dishId: 'a', quantity: 1 }, { dishId: 'b', quantity: 3 }] },
  { status: 'cancelled', items: [{ dishId: 'c', quantity: 10 }] },
  { status: 'pending', items: [{ dishId: 'a', quantity: 1 }] },
]);
assert.deepStrictEqual(Array.from(ids), ['b', 'a']);

console.log(`menu large catalog passed: 1000 dishes, first payload ${Math.round(size / 1024)}KB, built in ${elapsed}ms`);
