const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const menuJs = read('pages/menu/menu.js');
const menuWxml = read('pages/menu/menu.wxml');
const detailJs = read('package-extra/detail/detail.js');
const ordersJs = read('package-order/orders/orders.js');
const orderPresentationJs = read('package-order/utils/order-presentation.js');

assert.ok(menuJs.includes("require('../../services/cart')"), 'menu must use the shared cart service');
assert.ok(menuJs.includes('getDishRestriction(dish)'), 'menu must retain the shared can-order guard');
assert.ok(menuJs.includes("dish.type === 'drink'"), '3A must block drinks until the option sheet exists');
assert.ok(!menuJs.includes("wx.setStorageSync('cart'"), 'menu must not write cart storage directly');
assert.ok(!menuJs.includes("wx.getStorageSync('cart'"), 'menu must not read cart storage directly');
assert.ok(menuWxml.includes("wx:key='cartItemId'"), 'cart rows must use cartItemId');
assert.ok(menuWxml.includes('data-cartitemid'), 'cart row actions must target cartItemId');
assert.ok(menuWxml.includes('{{item.summaryText}}'), 'cart must display structured option summary');
assert.ok(menuWxml.includes('去确认'), 'cart must open the independent confirmation page');
assert.ok(!menuWxml.includes('3D 开放确认'), '3D placeholder must be removed');

assert.ok(detailJs.includes("require('../../services/cart')"), 'legacy checkout reader must use the cart service');
assert.ok(!detailJs.includes("wx.setStorageSync('orders'"), '3A must not create local fake orders');
assert.ok(!detailJs.includes("name: 'notifyOrder'"), '3A must not notify for an unpersisted order');

assert.ok(orderPresentationJs.includes("value === 'accepted'"), 'accepted is display-only legacy compatibility');
assert.ok(ordersJs.includes('normalizeLegacyOrders'), 'legacy orders remain local and read-only');
assert.ok(!ordersJs.includes('updateOrderStatus('), 'legacy local orders must be read-only');

console.log('cart integration tests passed');
