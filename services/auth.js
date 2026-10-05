const { callFamilyApi } = require('./cloud');

let session = null;
let pendingRequest = null;

async function getSession(forceRefresh = false) {
  if (!forceRefresh && session) return session;
  if (!forceRefresh && pendingRequest) return pendingRequest;

  pendingRequest = callFamilyApi('getSession')
    .then(data => {
      session = data;
      return session;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

function clearSession() {
  session = null;
  pendingRequest = null;
}

module.exports = {
  clearSession,
  getSession,
};
