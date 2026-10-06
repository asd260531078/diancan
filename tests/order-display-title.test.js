const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { orderDisplayTitle } = require('../package-order/utils/order-display-title');

assert.strictEqual(orderDisplayTitle('XG20260923-8EB639'), orderDisplayTitle('XG20260923-8EB639'));
assert.ok(orderDisplayTitle('XG20260923-8EB639').length <= 16);
assert.ok(new Set(Array.from({ length: 30 }, (_, index) => orderDisplayTitle(`XG-2026-${index}`))).size > 1);

let page;
vm.runInNewContext(read('package-order/orders/orders.js'), {
  Page(config) { page = config; },
  require(file) {
    if (file === '../../services/imageCache') return {
      setImageData(owner, patch, callback) { owner.setData(patch, callback); },
      releaseView() {},
    };
    if (file === '../../services/orders') return {
      async listMyOrders() { return { items: [{ id: 'order-1', orderNo: 'XG20260923-8EB639', status: 'pending', items: [] }], hasMore: false }; },
    };
    if (file === '../utils/order-presentation') return require('../package-order/utils/order-presentation');
    if (file === '../utils/order-display-title') return require('../package-order/utils/order-display-title');
    throw new Error(file);
  },
  wx: { getStorageSync() { return [{ id: 'old-1', orderNo: 'OLD-1', status: 'accepted', items: [] }]; } },
  console,
});
page.setData = function setData(patch) { Object.assign(this.data, patch); };

(async () => {
  page.loadLegacyOrders();
  await page.loadOrders(true);
  assert.strictEqual(page.data.orders[0].orderNo, 'XG20260923-8EB639', '真实订单号保持不变');
  assert.strictEqual(page.data.orders[0].displayTitle, orderDisplayTitle('XG20260923-8EB639'));
  assert.strictEqual(page.data.legacyOrders[0].status, 'preparing', '旧订单状态兼容保持不变');
  assert.strictEqual(page.data.legacyOrders[0].displayTitle, orderDisplayTitle('OLD-1'));
  const orderView = read('package-order/orders/orders.wxml');
  assert.ok(orderView.includes('{{item.displayTitle}}'));
  assert.ok(orderView.includes('{{item.orderNo}}'));
  assert.ok(orderView.includes('status-{{item.status}}'));

  console.log('phase 4 order title/icon tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
