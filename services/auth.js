const { callFamilyApi } = require('./cloud');

let session = null;
let sessionAt = 0;
let pendingRequest = null;

/**
 * forceRefresh=true 时重新向云端确认身份；可用 options.maxAgeMs 复用最近一次结果，
 * 避免每次切页都调用云函数（服务端写操作仍会再次校验管理员身份）。
 */
async function getSession(forceRefresh = false, options = {}) {
  const maxAgeMs = Number(options.maxAgeMs) || 0;
  const fresh = session && maxAgeMs > 0 && Date.now() - sessionAt < maxAgeMs;
  if (session && (!forceRefresh || fresh)) return session;
  // 正在进行的请求本身就是最新的，强制刷新也直接复用（启动时 App 和页面会同时请求）。
  if (pendingRequest) return pendingRequest;

  pendingRequest = callFamilyApi('getSession')
    .then(data => {
      session = data;
      sessionAt = Date.now();
      return session;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

/** 同步读取上次的身份结果（可能为空），用于页面先出画面。 */
function peekSession() {
  return session;
}

function clearSession() {
  session = null;
  sessionAt = 0;
  pendingRequest = null;
}

module.exports = {
  clearSession,
  getSession,
  peekSession,
};
