const app = getApp();
const authService = require('../../services/auth');
const chefOrderReminder = require('../../services/chef-order-reminder');
const orderService = require('../../services/orders');

const SESSION_MAX_AGE_MS = 60 * 1000;

Page({
  data: {
    mode: 'ordering',
    isAdmin: false,
    identityLoading: true,
    openid: '',
    openOrderBadge: '',
    chefPendingBadge: '',
  },

  onLoad() {
    this.setData({ mode: app.getCurrentMode() });
    this._unsubscribeChefBadge = chefOrderReminder.subscribe(reminderState => {
      this.setData({ chefPendingBadge: reminderState.pendingBadge });
    });
  },

  async onShow() {
    await this.loadIdentity();
  },

  onUnload() {
    if (this._unsubscribeChefBadge) this._unsubscribeChefBadge();
  },

  onOrderBadgeChange(event) {
    const badge = event.detail && event.detail.badge || '';
    if (this.data.openOrderBadge !== badge) this.setData({ openOrderBadge: badge });
  },

  async loadIdentity() {
    // 有上次的身份结果就直接显示，后台再确认，不再每次切到「我的」都闪一下“读取中”。
    const cached = typeof authService.peekSession === 'function' ? authService.peekSession() : null;
    if (!cached) this.setData({ identityLoading: true });
    try {
      const session = await authService.getSession(true, { maxAgeMs: SESSION_MAX_AGE_MS });
      app.globalData.openid = session.openid;
      app.globalData.isAdmin = session.isAdmin;
      let mode = app.getCurrentMode();
      if (!session.isAdmin && mode === 'cooking') {
        mode = 'ordering';
        app.setMode(mode);
      }
      const patch = { mode, isAdmin: session.isAdmin, openid: session.openid, identityLoading: false };
      if (Object.keys(patch).some(key => this.data[key] !== patch[key])) this.setData(patch);
      if (session.isAdmin) chefOrderReminder.start();
      else chefOrderReminder.reset();
    } catch (error) {
      console.error('身份读取失败', error);
      app.setMode('ordering');
      chefOrderReminder.reset();
      this.setData({ mode: 'ordering', isAdmin: false, identityLoading: false });
      wx.showToast({ title: '云端身份读取失败', icon: 'none' });
    }
  },

  onSwitchMode(e) {
    const targetMode = e.currentTarget.dataset.mode;
    if (targetMode === 'cooking' && !this.data.isAdmin) {
      wx.showModal({
        title: '仅管理员可用',
        content: '当前微信账号不在云端 admins 管理员集合中。',
        showCancel: false,
      });
      return;
    }
    app.setMode(targetMode);
    this.setData({ mode: targetMode });
  },

  onTapCard(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'manage') {
      if (!this.data.isAdmin) {
        wx.showToast({ title: '当前账号不是管理员', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: '/package-admin/manage/manage' });
    } else if (type === 'orders') {
      if (!this.data.isAdmin) {
        wx.showToast({ title: '当前账号不是管理员', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: '/package-admin/manage-orders/manage-orders' });
    } else if (type === 'myorders') {
      wx.navigateTo({ url: '/package-order/orders/orders' });
    } else if (type === 'favorite') {
      this._showFavoriteDishes();
    }
  },

  async _showFavoriteDishes() {
    // 订单已经在云端：按最近订单统计。旧云函数不支持时退回本机旧订单统计。
    try {
      wx.showLoading({ title: '统计中' });
      const stats = await orderService.getFrequentDishStats({ limit: 5 });
      wx.hideLoading();
      if (!stats.length) {
        wx.showModal({ title: '暂无常用菜品', content: '完成几笔订单后，这里会显示你最常点的菜', showCancel: false });
        return;
      }
      const list = stats.map((dish, index) => `${index + 1}. ${dish.name || '已下架菜品'}（共${dish.count}份）`).join('\n');
      wx.showModal({ title: '🍜 常用菜品 TOP5', content: list, showCancel: false });
      return;
    } catch (error) {
      wx.hideLoading();
      if (!error || error.code !== 'UNKNOWN_ACTION') {
        wx.showToast({ title: error && error.message || '统计失败，请稍后再试', icon: 'none' });
        return;
      }
    }
    const orders = wx.getStorageSync('orders') || [];
    const dishCount = {};
    orders.forEach(order => {
      if (order.status === 'cancelled') return;
      (order.items || []).forEach(item => {
        if (!dishCount[item.dishId]) {
          dishCount[item.dishId] = { name: item.name, count: 0, dishId: item.dishId, price: item.price };
        }
        dishCount[item.dishId].count += item.num;
      });
    });

    const sorted = Object.values(dishCount).sort((a, b) => b.count - a.count).slice(0, 5);
    if (sorted.length === 0) {
      wx.showModal({ title: '暂无常用菜品', content: '完成几笔订单后，这里会显示你最常点的菜', showCancel: false });
      return;
    }
    const list = sorted.map((dish, index) => `${index + 1}. ${dish.name}（共${dish.count}份）`).join('\n');
    wx.showModal({ title: '🍜 常用菜品 TOP5', content: list, showCancel: false });
  },
});
