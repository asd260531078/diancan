// app.js
const authService = require('./services/auth');
const cloudConfig = require('./config/cloud');
const chefOrderReminder = require('./services/chef-order-reminder');
const imageCache = require('./services/imageCache');

App({
  globalData: {
    openid: null,
    isAdmin: false,
    sessionReady: null,
    imageCacheReady: null,
    pendingCartEdit: null,
    mode: 'ordering', // 'cooking' 餐饮模式(商家) | 'ordering' 点餐模式(顾客)
  },

  onLaunch() {
    this._isForeground = false;
    // Restore the persistent index synchronously before pages can bind images.
    // No downloads or cache clearing during startup. Debug logs are dev/trial only.
    let logImages = true;
    try {
      const account = typeof wx.getAccountInfoSync === 'function' && wx.getAccountInfoSync();
      if (account && account.miniProgram) logImages = account.miniProgram.envVersion !== 'release';
    } catch (_) { /* Keep diagnostics available during local testing. */ }
    imageCache.setDebugLogging(logImages);
    this.globalData.imageCacheReady = imageCache.init();
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      const cloudOptions = { traceUser: true };
      if (cloudConfig.envId && cloudConfig.envId !== 'YOUR_CLOUD_ENV_ID') {
        cloudOptions.env = cloudConfig.envId;
      }
      wx.cloud.init(cloudOptions);
    }

    // 恢复保存的模式
    this.globalData.mode = this.getCurrentMode();

    // 获取云端身份。页面需要管理员权限时仍会自行刷新并再次校验；
    // 这里的结果只用于界面状态，不作为服务端授权依据。
    this.globalData.sessionReady = this.bootstrapSession();

  },

  onShow() {
    this._isForeground = true;
    const sessionReady = this.globalData.sessionReady;
    if (sessionReady && typeof sessionReady.then === 'function') {
      sessionReady.then(session => {
        if (this._isForeground && session && session.isAdmin) chefOrderReminder.start();
      });
    }
  },

  onHide() {
    this._isForeground = false;
    imageCache.flushIndex();
    chefOrderReminder.stop();
  },

  getImageCacheDebugInfo() {
    return imageCache.getDebugInfo();
  },

  async bootstrapSession() {
    try {
      const session = await authService.getSession();
      this.globalData.openid = session.openid;
      this.globalData.isAdmin = session.isAdmin;
      if (!session.isAdmin && this.globalData.mode === 'cooking') {
        this.setMode('ordering');
      }
      if (session.isAdmin && this._isForeground) {
        chefOrderReminder.start();
      } else if (!session.isAdmin) {
        chefOrderReminder.reset();
      }
      return session;
    } catch (error) {
      console.error('云端身份初始化失败', error);
      chefOrderReminder.reset();
      return null;
    }
  },

  setMode(mode) {
    if (mode === 'cooking' || mode === 'ordering') {
      this.globalData.mode = mode;
      wx.setStorageSync('app_mode', mode);
    }
  },

  getCurrentMode() {
    return wx.getStorageSync('app_mode') || 'ordering';
  },
});
