const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const categories = [{ id: 'hot', name: '热炒小菜' }];
const dishes = [{ id: 'one', name: '热炒', categoryId: 'hot', enabled: true,
  type: 'food', cover: 'cloud://env/one.png', price: 10 }];

function createMenu(options = {}) {
  let menu;
  let tabConfig;
  let requests = 0;
  let categoryRequests = 0;
  const patches = [];
  const logs = [];
  const app = { globalData: {} };
  vm.runInNewContext(read('pages/menu/menu.js'), {
    Page(config) { menu = config; }, getApp: () => app,
    console: { error() {}, log(...args) { logs.push(args); } },
    wx: { getStorageSync: () => [], showToast() {} },
    require(name) {
      if (name === '../../services/imageCache') return {
        imageEventHandlers: {}, releaseView() {},
        init() { throw new Error('menu initialization must not await image cache'); },
        resolveImages() { throw new Error('menu initialization must not await images'); },
        getDisplayImage: value => value,
        setImageData(owner, patch, callback, settings) {
          assert.strictEqual(settings.queue, false);
          owner.setData(patch, callback);
        },
        // A slow image download must not hold up menuReady.
        queueCaches: () => new Promise(() => {}),
      };
      if (name === '../../services/catalog') return {
        getCachedCatalog: () => options.snapshot || { categories: [], dishes: [] },
        getCatalogRevision: () => 0,
        async listDishes() { requests += 1; return { items: options.dishes || dishes }; },
        async listCategories() {
          categoryRequests += 1;
          if (options.failOnce && categoryRequests === 1) throw new Error('offline');
          return { items: await (options.categories || categories) };
        },
      };
      if (name === '../../services/cart') return { loadCart: () => [], getItemCount: () => 0, getTotalAmount: () => 0 };
      return require(path.join(root, 'pages/menu', name));
    },
  });
  menu.route = 'pages/menu/menu';
  menu.setData = function (patch, callback) {
    patches.push(patch);
    Object.entries(patch).forEach(([key, value]) => {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = this.data;
      parts.slice(0, -1).forEach(part => { target = target[part]; });
      target[parts[parts.length - 1]] = value;
    });
    if (callback) callback();
  };
  // Use the real bottom TabBar: this entry changes viewMode without page onShow.
  vm.runInNewContext(read('components/custom-tab-bar/index.js'), {
    Component(config) { tabConfig = config; },
    require: () => ({}), getCurrentPages: () => [menu], getApp: () => app,
    wx: { switchTab() { throw new Error('same-route tab must not navigate'); } },
  });
  const tab = { data: tabConfig.data, ...tabConfig.methods,
    setData(patch) { Object.assign(this.data, patch); } };
  return { menu, patches, logs, app, requests: () => requests,
    tapMenu() { tab.switchTab({ currentTarget: { dataset: { index: 1 } } }); } };
}

function assertReady(harness, expectedCount) {
  const { menu, patches } = harness;
  const active = menu.data.categoryPanels.find(panel => panel.categoryId === menu.data.activeCategoryId);
  assert.ok(active && active.visited, 'default panel must be mounted without a category tap');
  assert.strictEqual(menu.data.menuReady, true);
  assert.strictEqual(active.dishes.length, expectedCount);
  const initialization = patches.filter(patch => patch.categoryPanels);
  assert.ok(initialization.length > 0);
  initialization.forEach(patch => {
    assert.ok(patch.categories && patch.dishes && patch.menuReady);
    assert.ok(patch.categoryPanels.some(panel => panel.visited && panel.categoryId === patch.activeCategoryId),
      'categories, dishes, panels, default selection and readiness must be committed together');
  });
  assert.ok(harness.logs.some(args => args[0] === '[menu INIT]'));
}

async function run() {
  const home = createMenu();
  home.menu.onLoad();
  await home.menu.onShow();
  home.tapMenu();
  assert.strictEqual(home.menu.data.viewMode, 'menu');
  assert.strictEqual(home.menu.data.activeCategoryId, 'all');
  assertReady(home, 1);

  const direct = createMenu();
  direct.menu.onLoad({ view: 'menu' });
  await direct.menu.onShow();
  assertReady(direct, 1);

  let finishCategories;
  const delayed = createMenu({ categories: new Promise(resolve => { finishCategories = resolve; }) });
  delayed.menu.onLoad();
  const loading = delayed.menu.onShow();
  delayed.tapMenu();
  assert.strictEqual(delayed.menu.data.menuReady, false);
  assert.strictEqual(delayed.menu.data.categoryPanels.length, 0, 'do not publish partially initialized panels');
  finishCategories(categories);
  await loading;
  assertReady(delayed, 1);

  const snapshot = createMenu({ snapshot: { categories, dishes } });
  snapshot.menu.onLoad();
  snapshot.tapMenu();
  assertReady(snapshot, 1);
  assert.strictEqual(snapshot.requests(), 0, 'read-only snapshot renders immediately without a network wait');

  const ids = createMenu({ categories: [{ _id: 7, name: '旧分类' }],
    dishes: [{ ...dishes[0], categoryId: '7' }] });
  ids.menu.data.activeCategoryId = 7;
  ids.menu.onLoad({ view: 'menu' });
  await ids.menu.onShow();
  assert.strictEqual(ids.menu.data.activeCategoryId, '7');
  assertReady(ids, 1);
  const panels = ids.menu.data.categoryPanels;
  const src = panels[1].dishes[0].displayCover;
  await ids.menu.onShow();
  assert.strictEqual(ids.menu.data.categoryPanels, panels, 'background return preserves resident panels');
  assert.strictEqual(ids.menu.data.activeCategoryId, '7');
  assert.strictEqual(panels[1].dishes[0].displayCover, src);
  assert.strictEqual(ids.requests(), 1);

  for (const invalid of ['', null, undefined, 'removed']) {
    const fallback = createMenu();
    fallback.menu.data.activeCategoryId = invalid;
    fallback.menu.onLoad({ view: 'menu' });
    await fallback.menu.onShow();
    assert.strictEqual(fallback.menu.data.activeCategoryId, 'all');
    assertReady(fallback, 1);
  }
  const empty = createMenu({ dishes: [], categories: [] });
  empty.menu.onLoad({ view: 'menu' });
  await empty.menu.onShow();
  assertReady(empty, 0);
  assert.strictEqual(empty.menu.data.categoryPanels[0].visibleCount, 0, 'empty catalog still mounts its empty-state panel');

  const retry = createMenu({ failOnce: true });
  retry.menu.onLoad({ view: 'menu' });
  await retry.menu.onShow();
  assert.strictEqual(retry.menu.data.menuReady, false);
  assert.strictEqual(retry.menu.data.catalogError, true, 'failed initial request shows retry instead of blank panels');
  await retry.menu.retryCatalog();
  assertReady(retry, 1);
  assert.strictEqual(retry.menu.data.catalogError, false);

  const wxml = read('pages/menu/menu.wxml');
  assert.ok(wxml.includes('!menuReady'));
  assert.ok(wxml.includes("wx:if='{{panel.visited}}'"));
  assert.ok(wxml.includes("hidden='{{activeCategoryId !== panel.categoryId}}'"));
  console.log('menu first render passed: real bottom-tab entry, direct entry, async data, snapshot, normalized IDs, empty menu and background return');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
