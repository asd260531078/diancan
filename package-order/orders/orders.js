const orderService = require('../../services/orders');
const imageCache = require('../../services/imageCache');
const { normalizeLegacyOrders, normalizeOrder } = require('../utils/order-presentation');
const { orderDisplayTitle } = require('../utils/order-display-title');

function decorateOrder(order) {
  return { ...order, displayTitle: orderDisplayTitle(order.orderNo, order.id) };
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    orders: [],
    legacyOrders: [],
    hasMore: false,
    nextOffset: 0,
    errorMessage: '',
  },

  onLoad() {
    this.loadLegacyOrders();
  },

  onUnload() {
    imageCache.releaseView(this);
  },

  async onShow() {
    await this.loadOrders(true);
  },

  async onPullDownRefresh() {
    await this.loadOrders(true);
    wx.stopPullDownRefresh();
  },

  loadLegacyOrders() {
    const legacyOrders = normalizeLegacyOrders(wx.getStorageSync('orders') || []).map(decorateOrder);
    imageCache.setImageData(this, { legacyOrders }, null, { queue: false });
  },

  async loadOrders(reset = false) {
    if (this.data.loadingMore) return;
    const offset = reset ? 0 : this.data.nextOffset;
    this.setData(reset
      ? { loading: true, errorMessage: '' }
      : { loadingMore: true, errorMessage: '' });
    try {
      const result = await orderService.listMyOrders({ limit: 20, offset });
      const incoming = (result.items || []).map(raw => decorateOrder(normalizeOrder(raw)));
      imageCache.setImageData(this, {
        orders: reset ? incoming : [...this.data.orders, ...incoming],
        hasMore: Boolean(result.hasMore),
        nextOffset: result.nextOffset || 0,
      }, null, { queue: false });
    } catch (error) {
      console.error('读取云端订单失败', error);
      this.setData({ errorMessage: error.message || '订单读取失败，请稍后重试' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadOrders(false);
  },

  goDetail(event) {
    const orderId = event.currentTarget.dataset.orderid;
    if (!orderId) return;
    wx.navigateTo({ url: `/package-order/order-detail/order-detail?id=${encodeURIComponent(orderId)}` });
  },

  cancelOrder(event) {
    const orderId = event.currentTarget.dataset.orderid;
    wx.showModal({
      title: '取消点菜单',
      content: '确定取消这笔待确认订单吗？',
      success: async result => {
        if (!result.confirm) return;
        try {
          await orderService.cancelMyOrder(orderId);
          wx.showToast({ title: '订单已取消', icon: 'success' });
          await this.loadOrders(true);
        } catch (error) {
          wx.showToast({ title: error.message || '取消失败', icon: 'none' });
        }
      },
    });
  },
});
