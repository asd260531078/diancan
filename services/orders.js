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
  return callFamilyApi('createOrder', buildCreateOrderPayload(draft));
}

async function listMyOrders(options = {}) {
  return callFamilyApi('listMyOrders', {
    limit: options.limit || 20,
    offset: options.offset || 0,
  });
}

async function listMyUnfinishedOrderSummary() {
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

async function countMyUnfinishedOrders() {
  const summary = await listMyUnfinishedOrderSummary();
  return summary.count;
}

async function getMyOrderDetail(orderId) {
  return callFamilyApi('getMyOrderDetail', { orderId });
}

async function cancelMyOrder(orderId) {
  return callFamilyApi('cancelMyOrder', { orderId });
}

async function listManageOrders(options = {}) {
  return callFamilyApi('listManageOrders', {
    status: options.status || 'all',
    limit: options.limit || 20,
    offset: options.offset || 0,
  });
}

async function getManageOrderDetail(orderId) {
  return callFamilyApi('getManageOrderDetail', { orderId });
}

async function updateOrderStatus(orderId, status) {
  return callFamilyApi('updateOrderStatus', { orderId, status });
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
  countMyUnfinishedOrders,
  createOrder,
  getManageOrderDetail,
  getMyOrderDetail,
  listManageOrders,
  listMyUnfinishedOrderSummary,
  listMyOrders,
  notifyOrderCreated,
  updateOrderStatus,
};
