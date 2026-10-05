const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function run() {
  let pendingOrders = [{ id: 'A' }, { id: 'B' }];
  let vibrateCount = 0;
  let toastCount = 0;
  let intervalMs = 0;
  let intervalCallback = null;
  let intervalCount = 0;
  let cleared = false;
  const serviceModule = { exports: {} };

  vm.runInNewContext(read('services/chef-order-reminder.js'), {
    module: serviceModule,
    require(file) {
      assert.strictEqual(file, './orders');
      return {
        async listManageOrders(options) {
          assert.strictEqual(options.status, 'pending');
          return { items: pendingOrders, hasMore: false, nextOffset: null };
        },
      };
    },
    wx: {
      vibrateShort() { vibrateCount += 1; },
      showToast(options) {
        toastCount += 1;
        assert.strictEqual(options.title, '收到新的点菜单啦');
        assert.strictEqual(options.duration, 2000);
      },
    },
    console: { warn() {} },
    setInterval(callback, ms) {
      intervalCallback = callback;
      intervalMs = ms;
      intervalCount += 1;
      return 7;
    },
    clearInterval(timer) { assert.strictEqual(timer, 7); cleared = true; },
    Set,
    String,
    Array,
    Number,
  });

  const reminder = serviceModule.exports;
  let latest = null;
  reminder.subscribe(state => { latest = state; });
  await reminder.start();
  assert.strictEqual(intervalMs, 15000);
  await reminder.start();
  assert.strictEqual(intervalCount, 1, 're-entering a page must not create another timer');
  assert.strictEqual(latest.pendingCount, 2);
  assert.strictEqual(latest.pendingBadge, '2');
  assert.strictEqual(vibrateCount, 0, 'first load must only establish the baseline');
  assert.strictEqual(toastCount, 0, 'first load must not toast historical pending orders');

  pendingOrders = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  await reminder.refresh();
  assert.strictEqual(latest.pendingCount, 3);
  assert.strictEqual(vibrateCount, 1);
  assert.strictEqual(toastCount, 1);

  await intervalCallback();
  assert.strictEqual(vibrateCount, 1, 'the same pending IDs must not alert twice');
  assert.strictEqual(toastCount, 1, 'the same pending IDs must not toast twice');

  reminder.removePendingOrder('A');
  assert.strictEqual(latest.pendingCount, 2);
  assert.strictEqual(reminder.formatBadge(0), '');
  assert.strictEqual(reminder.formatBadge(99), '99');
  assert.strictEqual(reminder.formatBadge(100), '99+');

  reminder.stop();
  assert.strictEqual(cleared, true);

  const profileWxml = read('pages/profile/profile.wxml');
  const manageWxml = read('package-admin/manage/manage.wxml');
  const manageOrdersWxml = read('package-admin/manage-orders/manage-orders.wxml');
  const detailJs = read('package-order/order-detail/order-detail.js');
  assert.ok(profileWxml.includes('switch-order-badge'));
  assert.ok(profileWxml.includes('chefPendingBadge'));
  assert.ok(manageWxml.includes('orders-badge'));
  assert.ok(manageOrdersWxml.includes("item.value === 'pending' && chefPendingBadge"));
  assert.ok(detailJs.includes('chefOrderReminder.removePendingOrder'));
  console.log('chef pending order reminder tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
