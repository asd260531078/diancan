const { newOrderTemplateId } = require('../config/notify');

// 微信一次性订阅：每次用户同意，云端才能多发一条新订单提醒。
// 厨师勾选“总是保持以上选择”后，之后的调用不再弹窗，只是静默累计次数。
// 必须在点击事件里同步调用（不能放在 await 之后），否则微信会拒绝。
let declinedThisSession = false;

function isConfigured() {
  return Boolean(newOrderTemplateId);
}

function requestNewOrderSubscription(options = {}) {
  if (!isConfigured() || typeof wx.requestSubscribeMessage !== 'function') return Promise.resolve(false);
  if (declinedThisSession && !options.explicit) return Promise.resolve(false);
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: [newOrderTemplateId],
      success: result => {
        const accepted = result && result[newOrderTemplateId] === 'accept';
        if (!accepted) declinedThisSession = true;
        if (options.explicit) {
          wx.showToast({ title: accepted ? '已开启新订单提醒' : '未开启提醒', icon: accepted ? 'success' : 'none' });
        }
        resolve(accepted);
      },
      fail: () => resolve(false),
    });
  });
}

module.exports = {
  isConfigured,
  requestNewOrderSubscription,
};
