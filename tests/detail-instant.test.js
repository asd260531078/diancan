const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const summary = { id: 'egg', name: '番茄炒蛋', type: 'food', price: 18, cover: 'cloud://env/egg.png', enabled: true,
  steps: [], ingredients: [] };
const full = { ...summary, steps: [{ id: 's1', stepNumber: 1, description: '先炒蛋' }],
  ingredients: [{ id: 'i1', name: '鸡蛋', amount: '3 个' }] };

function createPage(options = {}) {
  let page;
  let finishDetail;
  const calls = { detail: 0, list: 0, added: [] };
  const toasts = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'package-extra/detail/detail.js'), 'utf8'), {
    Page(config) { page = config; },
    console: { error() {}, warn() {} },
    getCurrentPages: () => [],
    wx: {
      setNavigationBarTitle() {}, showModal() {}, switchTab() {}, navigateBack() {},
      showToast: toast => toasts.push(toast), vibrateShort() {},
    },
    require(name) {
      if (name === '../../services/catalog') return {
        peekDish: id => (options.cached && id === summary.id ? summary : null),
        getDishDetail() {
          calls.detail += 1;
          if (options.fail) return Promise.reject(new Error('offline'));
          return new Promise(resolve => { finishDetail = () => resolve({ item: full }); });
        },
        async listDishes() { calls.list += 1; return { items: [summary] }; },
      };
      if (name === '../../services/imageCache') return {
        imageEventHandlers: {}, releaseView() {},
        setImageData(owner, data) { owner.setData(data); },
      };
      if (name === '../../services/cart') return {
        addDish(dish, selected, quantity) { calls.added.push(dish.id); return [{ quantity }]; },
        getItemCount: items => items.length,
      };
      if (name === '../../services/auth') return { async getSession() { return { isAdmin: false }; } };
      return require(path.join(root, 'package-extra/detail', name));
    },
  });
  page.setData = function setData(patch) { Object.assign(this.data, patch); };
  page.data = JSON.parse(JSON.stringify(page.data));
  return { page, calls, toasts, finish: () => finishDetail() };
}

async function run() {
  // 菜单里已有摘要：同步出画面，做法后台补齐。
  const cached = createPage({ cached: true });
  const loading = cached.page.loadSingleDish('egg');
  assert.strictEqual(cached.page.data.singleDish.name, '番茄炒蛋', 'summary renders before the network returns');
  assert.strictEqual(cached.page.data.detailLoading, false);
  assert.strictEqual(cached.page.data.recipeLoading, true);
  cached.finish();
  await loading;
  assert.strictEqual(cached.page.data.recipeLoading, false);
  assert.strictEqual(cached.page.data.singleDish.steps.length, 1);
  assert.strictEqual(cached.page.data.singleDish.ingredients[0].name, '鸡蛋');
  assert.strictEqual(cached.calls.detail, 1);

  // 加入点菜单不再整单重拉菜单。
  cached.page.addDetailFoodToCart(cached.page.data.singleDish, { tastePreference: '', customRequests: [] }, 1);
  assert.deepStrictEqual(cached.calls.added, ['egg']);
  assert.strictEqual(cached.calls.list, 0, 'adding to cart must not download the menu');

  // 没有摘要（例如从分享直接进入）：显示加载中，拿到详情后再渲染。
  const cold = createPage();
  const coldLoading = cold.page.loadSingleDish('egg');
  assert.strictEqual(cold.page.data.singleDish, null);
  cold.finish();
  await coldLoading;
  assert.strictEqual(cold.page.data.singleDish.steps.length, 1);

  // 网络失败但已显示摘要：保留内容，只提示做法加载失败。
  const offline = createPage({ cached: true, fail: true });
  await offline.page.loadSingleDish('egg');
  assert.strictEqual(offline.page.data.singleDish.name, '番茄炒蛋');
  assert.strictEqual(offline.page.data.detailNotFound, false);
  assert.strictEqual(offline.page.data.recipeError, true);

  console.log('detail instant render passed: summary first, recipe in background, local add-to-cart, offline keeps summary');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
