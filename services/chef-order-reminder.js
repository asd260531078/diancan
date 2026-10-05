const orderService = require('./orders');

const POLL_INTERVAL_MS = 15000;
const PAGE_SIZE = 50;

let timer = null;
let active = false;
let initialized = false;
let refreshRequest = null;
let requestGeneration = 0;
let knownPendingIds = new Set();
let state = {
  pendingCount: 0,
  pendingBadge: '',
  pendingOrderIds: [],
};
const listeners = new Set();

function formatBadge(count) {
  return count > 99 ? '99+' : count > 0 ? String(count) : '';
}

function snapshot() {
  return {
    pendingCount: state.pendingCount,
    pendingBadge: state.pendingBadge,
    pendingOrderIds: [...state.pendingOrderIds],
  };
}

function publish(pendingIds) {
  const ids = Array.from(new Set((pendingIds || []).filter(Boolean).map(String)));
  state = {
    pendingCount: ids.length,
    pendingBadge: formatBadge(ids.length),
    pendingOrderIds: ids,
  };
  listeners.forEach(listener => {
    try {
      listener(snapshot());
    } catch (error) {
      console.warn('厨师订单角标订阅更新失败', error);
    }
  });
}

async function fetchPendingOrderIds() {
  const ids = [];
  let offset = 0;
  for (;;) {
    const result = await orderService.listManageOrders({
      status: 'pending',
      limit: PAGE_SIZE,
      offset,
    });
    const items = Array.isArray(result.items) ? result.items : [];
    items.forEach(item => {
      const id = item.id || item._id || item.orderNo;
      if (id) ids.push(String(id));
    });
    if (!result.hasMore) break;
    const nextOffset = Number(result.nextOffset);
    if (!Number.isInteger(nextOffset) || nextOffset <= offset) break;
    offset = nextOffset;
  }
  return Array.from(new Set(ids));
}

function notifyNewOrder() {
  try {
    wx.vibrateShort();
  } catch (error) {
    console.warn('新订单震动提醒失败', error);
  }
  try {
    wx.showToast({ title: '收到新的点菜单啦', icon: 'none', duration: 2000 });
  } catch (error) {
    console.warn('新订单 Toast 提醒失败', error);
  }
}

async function refresh(options = {}) {
  if (refreshRequest) return refreshRequest;
  const shouldNotify = options.notify !== false;
  const generation = requestGeneration;
  const request = (async () => {
    try {
      const pendingIds = await fetchPendingOrderIds();
      if (generation !== requestGeneration) return snapshot();
      if (!initialized) {
        knownPendingIds = new Set(pendingIds);
        initialized = true;
        publish(pendingIds);
        return snapshot();
      }

      const hasNewOrder = pendingIds.some(id => !knownPendingIds.has(id));
      knownPendingIds = new Set(pendingIds);
      publish(pendingIds);
      if (shouldNotify && hasNewOrder) notifyNewOrder();
      return snapshot();
    } catch (error) {
      console.warn('厨师待处理订单刷新失败', error);
      return snapshot();
    } finally {
      if (refreshRequest === request) refreshRequest = null;
    }
  })();
  refreshRequest = request;
  return refreshRequest;
}

function start() {
  if (active) return refresh();
  active = true;
  const initialRefresh = refresh();
  timer = setInterval(() => refresh(), POLL_INTERVAL_MS);
  return initialRefresh;
}

function stop() {
  active = false;
  if (timer) clearInterval(timer);
  timer = null;
  requestGeneration += 1;
  refreshRequest = null;
}

function reset() {
  stop();
  initialized = false;
  knownPendingIds = new Set();
  publish([]);
}

function removePendingOrder(orderId) {
  const id = String(orderId || '');
  if (!id || !knownPendingIds.has(id)) return;
  knownPendingIds.delete(id);
  publish(Array.from(knownPendingIds));
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

module.exports = {
  POLL_INTERVAL_MS,
  formatBadge,
  refresh,
  removePendingOrder,
  reset,
  start,
  stop,
  subscribe,
};
