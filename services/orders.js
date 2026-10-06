const { callFamilyApi } = require('./cloud');

function buildCreateOrderPayload(draft = {}) {
  return {
    requestId: draft.requestId,
    orderNote: draft.orderNote,
    items: (Array.isArray(draft.items) ? draft.items : []).map(item => ({
      dishId: item.dishId,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions || {},
    })),
  };
}

async function createOrder(draft) {
  const result = await callFamilyApi('createOrder', buildCreateOrderPayload(draft));
  invalidateFrequentDishes();
  invalidateOpenOrderSummary();
  return result;
}

async function listMyOrders(options = {}) {
  return callFamilyApi('listMyOrders', {
    limit: options.limit || 20,
    offset: options.offset || 0,
  });
}

async function scanUnfinishedOrderSummary() {
  const unfinished = new Set(['pending', 'confirmed', 'preparing']);
  let count = 0;
  const orderIds = [];
  let offset = 0;
  for (;;) {
    // listMyOrders 在云端按当前 OpenID 过滤；这里只读，不查询厨师后台订单。
    const result = await listMyOrders({ limit: 20, offset });
    const items = Array.isArray(result.items) ? result.items : [];
    items.forEach(item => {
      if (!unfinished.has(item.status)) return;
      count += 1;
      const id = item.id || item._id || item.orderNo;
      if (id) orderIds.push(String(id));
    });
    if (count > 99 || !result.hasMore) {
      return { count, orderIds: Array.from(new Set(orderIds)) };
    }
    const nextOffset = Number(result.nextOffset);
    if (!Number.isInteger(nextOffset) || nextOffset <= offset) {
      return { count, orderIds: Array.from(new Set(orderIds)) };
    }
    offset = nextOffset;
  }
}

// 每个 Tab 页显示时都会刷新角标：合并并发请求，并在几秒内复用结果。
const OPEN_SUMMARY_TTL_MS = 5000;
let openSummaryCache = null;
let openSummaryRequest = null;

async function listMyUnfinishedOrderSummary(options = {}) {
  if (!options.force && openSummaryCache && Date.now() - openSummaryCache.at < OPEN_SUMMARY_TTL_MS) {
    return openSummaryCache.summary;
  }
  if (openSummaryRequest) return openSummaryRequest;
  openSummaryRequest = callFamilyApi('getMyOpenOrderSummary')
    .catch(error => {
      // 云函数尚未重新部署时退回旧的逐页统计。
      if (error && error.code === 'UNKNOWN_ACTION') return scanUnfinishedOrderSummary();
      throw error;
    })
    .then(summary => {
      const result = { count: Number(summary.count) || 0, orderIds: Array.isArray(summary.orderIds) ? summary.orderIds : [] };
      openSummaryCache = { summary: result, at: Date.now() };
      return result;
    })
    .finally(() => { openSummaryRequest = null; });
  return openSummaryRequest;
}

function invalidateOpenOrderSummary() {
  openSummaryCache = null;
}

async function countMyUnfinishedOrders(options = {}) {
  const summary = await listMyUnfinishedOrderSummary(options);
  return summary.count;
}

// 常点菜品：用最近的云端订单统计，5 分钟内复用结果；失败时返回上次结果，不打断页面。
const FREQUENT_TTL_MS = 5 * 60 * 1000;
const FREQUENT_STORAGE_KEY = 'family_frequent_dishes_v1';
let frequentCache = null;
let frequentRequest = null;

function readFrequentSnapshot() {
  try {
    const saved = wx.getStorageSync(FREQUENT_STORAGE_KEY);
    return saved && Array.isArray(saved.dishIds) ? saved : null;
  } catch (_) { return null; }
}

function countFrequentDishIds(orders = [], limit = 6) {
  const counts = new Map();
  orders.forEach(order => {
    if (!order || order.status === 'cancelled' || !Array.isArray(order.items)) return;
    order.items.forEach(item => {
      const dishId = item && item.dishId;
      if (!dishId) return;
      counts.set(dishId, (counts.get(dishId) || 0) + (Number(item.quantity) || 1));
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([dishId]) => dishId);
}

/** 同步读取上次统计结果（内存或本地），首页立即可用。 */
function peekFrequentDishIds() {
  if (frequentCache) return frequentCache.dishIds;
  const saved = readFrequentSnapshot();
  return saved ? saved.dishIds : [];
}

async function getFrequentDishIds(options = {}) {
  if (!options.force && frequentCache && Date.now() - frequentCache.at < FREQUENT_TTL_MS) return frequentCache.dishIds;
  if (frequentRequest) return frequentRequest;
  // 新接口在云端统计好只回传菜品 ID；云函数未重新部署时退回拉最近 30 单本地统计。
  frequentRequest = callFamilyApi('getMyFrequentDishes', { limit: 6 })
    .then(data => (Array.isArray(data.dishIds) ? data.dishIds : []))
    .catch(error => {
      if (!error || error.code !== 'UNKNOWN_ACTION') throw error;
      return listMyOrders({ limit: 30 }).then(result => countFrequentDishIds(result.items || []));
    })
    .then(dishIds => {
      frequentCache = { dishIds, at: Date.now() };
      try {
        if (typeof wx.setStorage === 'function') wx.setStorage({ key: FREQUENT_STORAGE_KEY, data: { dishIds }, fail() {} });
      } catch (_) { /* 只是展示优化。 */ }
      return dishIds;
    })
    .catch(error => {
      console.warn('统计常点菜品失败', error);
      return peekFrequentDishIds();
    })
    .finally(() => { frequentRequest = null; });
  return frequentRequest;
}

/** 「我的 → 常用菜品」：云端最近订单里点得最多的菜（名称 + 份数）。 */
async function getFrequentDishStats(options = {}) {
  const data = await callFamilyApi('getMyFrequentDishes', { limit: options.limit || 5 });
  return Array.isArray(data.items) ? data.items : [];
}

function invalidateFrequentDishes() {
  if (frequentCache) frequentCache.at = 0;
}

async function getMyOrderDetail(orderId) {
  return callFamilyApi('getMyOrderDetail', { orderId });
}

async function cancelMyOrder(orderId) {
  const result = await callFamilyApi('cancelMyOrder', { orderId });
  invalidateOpenOrderSummary();
  return result;
}

async function listManageOrders(options = {}) {
  return callFamilyApi('listManageOrders', {
    status: options.status || 'all',
    limit: options.limit || 20,
    offset: options.offset || 0,
  });
}

async function getManagePendingOrderSummary() {
  return callFamilyApi('getManagePendingOrderSummary');
}

async function getManageOrderDetail(orderId) {
  return callFamilyApi('getManageOrderDetail', { orderId });
}

async function updateOrderStatus(orderId, status) {
  const result = await callFamilyApi('updateOrderStatus', { orderId, status });
  invalidateOpenOrderSummary();
  return result;
}

async function notifyOrderCreated(orderId) {
  const response = await wx.cloud.callFunction({
    name: 'notifyOrder',
    data: { action: 'notifyNewOrder', orderId },
  });
  return response && response.result;
}

module.exports = {
  buildCreateOrderPayload,
  cancelMyOrder,
  countFrequentDishIds,
  countMyUnfinishedOrders,
  createOrder,
  getFrequentDishIds,
  getFrequentDishStats,
  getManageOrderDetail,
  getManagePendingOrderSummary,
  getMyOrderDetail,
  listManageOrders,
  listMyUnfinishedOrderSummary,
  listMyOrders,
  notifyOrderCreated,
  peekFrequentDishIds,
  updateOrderStatus,
};
