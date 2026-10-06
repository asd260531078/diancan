const app = getApp();
const orderService = require('../../services/orders');
const imageCache = require('../../services/imageCache');
const chefOrderReminder = require('../../services/chef-order-reminder');
const notifySubscription = require('../../services/order-notify-subscription');
const { normalizeOrder } = require('../utils/order-presentation');

const MANAGE_ACTIONS = {
  pending: [
    { status: 'confirmed', label: '确认订单', primary: true },
    { status: 'cancelled', label: '取消订单', danger: true },
  ],
  confirmed: [
    { status: 'preparing', label: '开始制作', primary: true },
    { status: 'cancelled', label: '取消订单', danger: true },
  ],
  preparing: [
    { status: 'completed', label: '完成订单', primary: true },
    { status: 'cancelled', label: '取消订单', danger: true },
  ],
  completed: [],
  cancelled: [],
};

Page({
  ...imageCache.imageEventHandlers,
  data: {
    orderId: '',
    isManage: false,
    loading: true,
    operating: false,
    order: null,
    manageActions: [],
    errorMessage: '',
  },

  onLoad(options) {
    this.setData({
      orderId: decodeURIComponent(options.id || ''),
      isManage: options.manage === '1',
    });
  },

  async onShow() {
    await this.loadOrder();
  },

  onUnload() {
    imageCache.releaseView(this);
  },

  onItemImageError(event) {
    imageCache.handleImageError(this, event.currentTarget.dataset.cover, undefined, event.currentTarget.dataset.src);
  },

  renderOrder(rawOrder) {
    const order = normalizeOrder(rawOrder);
    imageCache.setImageData(this, {
      order,
      loading: false,
      errorMessage: '',
      manageActions: this.data.isManage ? (MANAGE_ACTIONS[order.status] || []) : [],
    });
  },

  async loadOrder() {
    if (!this.data.orderId) {
      this.setData({ loading: false, errorMessage: '订单 ID 无效' });
      return;
    }
    // 刚提交的订单由确认页直接带过来，首次进入不必再等一次云端读取。
    const recent = app.globalData.recentOrder;
    if (recent && recent.id === this.data.orderId && !this.data.order) {
      app.globalData.recentOrder = null;
      this.renderOrder(recent);
      return;
    }
    // 已有内容时后台静默刷新，不再整页闪成“加载中”。
    if (!this.data.order) this.setData({ loading: true, errorMessage: '' });
    try {
      const result = this.data.isManage
        ? await orderService.getManageOrderDetail(this.data.orderId)
        : await orderService.getMyOrderDetail(this.data.orderId);
      this.renderOrder(result.order);
    } catch (error) {
      console.error('读取订单详情失败', error);
      if (!this.data.order) this.setData({ errorMessage: error.message || '订单详情读取失败' });
      else wx.showToast({ title: error.message || '刷新失败', icon: 'none' });
    } finally {
      if (this.data.loading) this.setData({ loading: false });
    }
  },

  cancelMyOrder() {
    wx.showModal({
      title: '取消点菜单',
      content: '确定取消这笔待确认订单吗？',
      success: async result => {
        if (!result.confirm) return;
        this.setData({ operating: true });
        try {
          const cancelled = await orderService.cancelMyOrder(this.data.orderId);
          wx.showToast({ title: '订单已取消', icon: 'success' });
          if (cancelled && cancelled.order) this.renderOrder(cancelled.order);
          else await this.loadOrder();
        } catch (error) {
          wx.showToast({ title: error.message || '取消失败', icon: 'none' });
        } finally {
          this.setData({ operating: false });
        }
      },
    });
  },

  changeStatus(event) {
    if (this.data.operating) return;
    const status = event.currentTarget.dataset.status;
    const label = event.currentTarget.dataset.label;
    wx.showModal({
      title: label,
      content: `确定要将订单更新为“${label}”吗？`,
      success: async result => {
        if (!result.confirm) return;
        // 顺手续一次“新订单提醒”订阅（勾选“总是保持”后不会弹窗）。
        if (this.data.isManage) notifySubscription.requestNewOrderSubscription();
        this.setData({ operating: true });
        try {
          const previousStatus = this.data.order && this.data.order.status;
          const updated = await orderService.updateOrderStatus(this.data.orderId, status);
          if (previousStatus === 'pending' && status !== 'pending') {
            chefOrderReminder.removePendingOrder(this.data.orderId);
          }
          wx.showToast({ title: '状态已更新', icon: 'success' });
          // 云端已返回最新订单，直接显示，省一次读取。
          if (updated && updated.order) this.renderOrder(updated.order);
          else await this.loadOrder();
        } catch (error) {
          wx.showToast({ title: error.message || '状态更新失败', icon: 'none' });
        } finally {
          this.setData({ operating: false });
        }
      },
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
