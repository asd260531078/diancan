const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function run() {
  let ownOrders = [
    { id: 'a', status: 'pending' },
    { id: 'b', status: 'confirmed' },
    { id: 'c', status: 'preparing' },
    { id: 'd', status: 'completed' },
    { id: 'e', status: 'cancelled' },
  ];
  const actions = [];
  let legacyServer = false;
  const serviceModule = { exports: {} };
  vm.runInNewContext(read('services/orders.js'), {
    module: serviceModule,
    Date,
    require(file) {
      assert.strictEqual(file, './cloud');
      return {
        async callFamilyApi(action, options) {
          actions.push(action);
          if (action === 'getMyOpenOrderSummary') {
            if (legacyServer) {
              const error = new Error('未知操作');
              error.code = 'UNKNOWN_ACTION';
              throw error;
            }
            // 模拟云端按状态过滤，最多返回 100 条。
            const open = ownOrders.filter(item => ['pending', 'confirmed', 'preparing'].includes(item.status)).slice(0, 100);
            return { count: open.length, orderIds: open.map(item => item.id) };
          }
          assert.strictEqual(action, 'listMyOrders');
          const items = ownOrders.slice(options.offset, options.offset + options.limit);
          const hasMore = options.offset + items.length < ownOrders.length;
          return { items, hasMore, nextOffset: hasMore ? options.offset + items.length : null };
        },
      };
    },
  });
  const service = serviceModule.exports;
  assert.strictEqual(await service.countMyUnfinishedOrders(), 3);
  assert.deepStrictEqual(Array.from((await service.listMyUnfinishedOrderSummary()).orderIds), ['a', 'b', 'c']);
  assert.deepStrictEqual(actions, ['getMyOpenOrderSummary'], 'one filtered request, then reuse for a few seconds');
  await Promise.all([service.listMyUnfinishedOrderSummary({ force: true }), service.listMyUnfinishedOrderSummary({ force: true })]);
  assert.strictEqual(actions.length, 2, 'concurrent tab badges share one request');
  ownOrders = Array.from({ length: 101 }, (_, index) => ({ id: `order-${index}`, status: 'pending' }));
  assert.strictEqual(await service.countMyUnfinishedOrders({ force: true }), 100);
  assert.ok(!actions.includes('listMyOrders'), 'badge never pages through order history');
  // 旧云函数：退回逐页统计。
  legacyServer = true;
  assert.strictEqual(await service.countMyUnfinishedOrders({ force: true }), 100);
  assert.ok(actions.includes('listMyOrders'));

  let component;
  let badgeCount = 0;
  let badgeRequests = 0;
  let profile;
  const chefState = { pendingCount: 0, pendingBadge: '', pendingOrderIds: [] };
  const chefService = {
    formatBadge(count) { return count > 99 ? '99+' : count > 0 ? String(count) : ''; },
    subscribe(listener) { listener(chefState); return () => {}; },
    start() {},
    reset() {},
  };
  vm.runInNewContext(read('pages/profile/profile.js'), {
    Page(config) { profile = config; },
    getApp() { return {}; },
    require(file) {
      if (file === '../../services/auth') return {};
      if (file === '../../services/chef-order-reminder') return chefService;
      if (file === '../../services/orders') return {};
      throw new Error(`unexpected profile dependency: ${file}`);
    },
  });
  const profilePage = {
    data: { ...profile.data },
    setData(data) { Object.assign(this.data, data); },
    ...profile,
  };
  let pages = [{ route: 'pages/menu/menu', data: { viewMode: 'home' }, setData(data) { Object.assign(this.data, data); } }];
  let destination = '';
  const app = { globalData: {} };
  vm.runInNewContext(read('components/custom-tab-bar/index.js'), {
    Component(config) { component = config; },
    require(file) {
      if (file === '../../services/orders') {
        return {
          async listMyUnfinishedOrderSummary() {
            badgeRequests += 1;
            return {
              count: badgeCount,
              orderIds: Array.from({ length: badgeCount }, (_, index) => `customer-${index}`),
            };
          },
        };
      }
      if (file === '../../services/chef-order-reminder') return chefService;
      throw new Error(`unexpected tab dependency: ${file}`);
    },
    getCurrentPages() { return pages; },
    getApp() { return app; },
    wx: { switchTab({ url }) { destination = url; } },
    setTimeout(callback) { callback(); },
  });
  const tab = {
    data: { ...component.data },
    setData(data) { Object.assign(this.data, data); },
    triggerEvent(name, detail) {
      assert.strictEqual(name, 'orderbadgechange');
      profilePage.onOrderBadgeChange({ detail });
    },
    ...component.methods,
    _detached: false,
    _customerOrderCount: 0,
    _customerOrderIds: [],
    _chefPendingCount: 0,
    _chefPendingIds: [],
  };
  assert.deepStrictEqual(Array.from(tab.data.list.map(item => item.text)), ['首页', '点餐', '我的']);
  assert.strictEqual(tab.getTabBarSelected(), 0);
  tab.switchTab({ currentTarget: { dataset: { index: 1 } } });
  assert.strictEqual(pages[0].data.viewMode, 'menu');
  assert.strictEqual(tab.getTabBarSelected(), 1);
  assert.strictEqual(destination, '');

  pages = [{ route: 'pages/profile/profile', data: {} }];
  assert.strictEqual(tab.getTabBarSelected(), 2);
  tab.switchTab({ currentTarget: { dataset: { index: 1 } } });
  assert.strictEqual(destination, '/pages/menu/menu');
  assert.strictEqual(app.globalData.menuTabView, 'menu');

  for (const [count, label] of [[0, ''], [1, '1'], [99, '99'], [100, '99+']]) {
    badgeCount = count;
    await tab.refreshOrderBadge();
    assert.strictEqual(tab.data.openOrderBadge, label);
    assert.strictEqual(profilePage.data.openOrderBadge, label);
  }
  assert.strictEqual(badgeRequests, 4);
  tab._customerOrderCount = 2;
  tab._customerOrderIds = ['shared-order', 'customer-only'];
  tab._chefPendingCount = 2;
  tab._chefPendingIds = ['shared-order', 'chef-only'];
  tab.updateCombinedBadge();
  assert.strictEqual(tab.data.openOrderBadge, '3', 'the same order must not be counted twice in the bottom badge');
  assert.ok(read('pages/profile/profile.wxml').includes('wx:if="{{openOrderBadge}}" class="card-order-badge"'));
  assert.ok(read('pages/profile/profile.wxml').includes('bind:orderbadgechange="onOrderBadgeChange"'));
  assert.ok(!read('components/custom-tab-bar/index.wxml').includes('icon-indicator'));
  console.log('tab navigation and personal order badge tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
