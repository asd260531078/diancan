const orderService = require('../../services/orders');
const imageCache = require('../../services/imageCache');
const chefOrderReminder = require('../../services/chef-order-reminder');
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

  async loadOrder() {
    if (!this.data.orderId) {
      this.setData({ loading: false, errorMessage: '订单 ID 无效' });
      return;
    }
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = this.data.isManage
        ? await orderService.getManageOrderDetail(this.data.orderId)
        : await orderService.getMyOrderDetail(this.data.orderId);
      const order = normalizeOrder(result.order);
      imageCache.setImageData(this, {
        order,
        manageActions: this.data.isManage ? (MANAGE_ACTIONS[order.status] || []) : [],
      });
    } catch (error) {
      console.error('读取订单详情失败', error);
      this.setData({ errorMessage: error.message || '订单详情读取失败' });
    } finally {
      this.setData({ loading: false });
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
          await orderService.cancelMyOrder(this.data.orderId);
          wx.showToast({ title: '订单已取消', icon: 'success' });
          await this.loadOrder();
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
        this.setData({ operating: true });
        try {
          const previousStatus = this.data.order && this.data.order.status;
          await orderService.updateOrderStatus(this.data.orderId, status);
          if (previousStatus === 'pending' && status !== 'pending') {
            chefOrderReminder.removePendingOrder(this.data.orderId);
          }
          wx.showToast({ title: '状态已更新', icon: 'success' });
          await this.loadOrder();
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
