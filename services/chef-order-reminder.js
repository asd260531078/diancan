const orderService = require('./orders');

const POLL_INTERVAL_MS = 15000;
// 实时监听正常时，轮询只作为兜底，降到每分钟一次。
const WATCH_FALLBACK_POLL_MS = 60000;
const PAGE_SIZE = 50;
// 页面切换会反复调用 start()；这段时间内刚刷新过就不再请求。
const START_REFRESH_THROTTLE_MS = 5000;

let timer = null;
let active = false;
let initialized = false;
let refreshRequest = null;
let requestGeneration = 0;
let knownPendingIds = new Set();
let watcher = null;
let watchHealthy = false;
let lastRefreshAt = 0;
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
  // 新接口只返回 ID；云函数还没重新部署时退回旧的分页拉整单。
  if (typeof orderService.getManagePendingOrderSummary === 'function') {
    try {
      const summary = await orderService.getManagePendingOrderSummary();
      return Array.from(new Set((summary.orderIds || []).map(String)));
    } catch (error) {
      if (!error || error.code !== 'UNKNOWN_ACTION') throw error;
    }
  }
  return scanPendingOrderIds();
}

async function scanPendingOrderIds() {
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
  lastRefreshAt = Date.now();
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

// 用云数据库实时推送感知新订单：有变化立刻刷新（真正的数据仍由云函数按管理员权限读取）。
// 需要在云开发控制台给 orders 集合配置“管理员可读”的安全规则；没配置时自动退回 15 秒轮询。
function startWatch() {
  if (watcher || typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.database !== 'function') return;
  try {
    watcher = wx.cloud.database().collection('orders').where({ status: 'pending' }).watch({
      onChange(snapshot) {
        watchHealthy = true;
        if (snapshot && snapshot.type === 'init') return;
        refresh();
      },
      onError(error) {
        console.warn('订单实时监听不可用，改用定时刷新', error && (error.errMsg || error.message));
        watchHealthy = false;
        closeWatch();
      },
    });
  } catch (error) {
    watchHealthy = false;
    watcher = null;
  }
}

function closeWatch() {
  const current = watcher;
  watcher = null;
  watchHealthy = false;
  if (current && typeof current.close === 'function') {
    try { current.close(); } catch (_) { /* 已断开 */ }
  }
}

function poll() {
  if (watchHealthy && Date.now() - lastRefreshAt < WATCH_FALLBACK_POLL_MS) return Promise.resolve(snapshot());
  return refresh();
}

function start() {
  if (active) {
    if (Date.now() - lastRefreshAt < START_REFRESH_THROTTLE_MS) return Promise.resolve(refreshRequest || snapshot());
    return refresh();
  }
  active = true;
  const initialRefresh = refresh();
  timer = setInterval(() => poll(), POLL_INTERVAL_MS);
  startWatch();
  return initialRefresh;
}

function stop() {
  active = false;
  if (timer) clearInterval(timer);
  timer = null;
  closeWatch();
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
