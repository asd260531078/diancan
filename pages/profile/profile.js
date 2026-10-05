const app = getApp();
const authService = require('../../services/auth');
const chefOrderReminder = require('../../services/chef-order-reminder');

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
    this.setData({ identityLoading: true });
    try {
      const session = await authService.getSession(true);
      app.globalData.openid = session.openid;
      app.globalData.isAdmin = session.isAdmin;
      let mode = app.getCurrentMode();
      if (!session.isAdmin && mode === 'cooking') {
        mode = 'ordering';
        app.setMode(mode);
      }
      this.setData({
        mode,
        isAdmin: session.isAdmin,
        openid: session.openid,
        identityLoading: false,
      });
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

  _showFavoriteDishes() {
    // 订单模块尚未迁移，本轮暂时保留旧本地统计，后续改为云端用户维度统计。
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
