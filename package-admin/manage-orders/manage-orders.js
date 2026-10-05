const orderService = require('../../services/orders');
const imageCache = require('../../services/imageCache');
const chefOrderReminder = require('../../services/chef-order-reminder');
const { normalizeOrder } = require('../utils/order-presentation');

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'preparing', label: '制作中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

Page({
  data: {
    filters: FILTERS,
    filter: 'all',
    loading: true,
    loadingMore: false,
    orders: [],
    hasMore: false,
    nextOffset: 0,
    errorMessage: '',
    chefPendingBadge: '',
  },

  onLoad() {
    this._unsubscribeChefBadge = chefOrderReminder.subscribe(reminderState => {
      this.setData({ chefPendingBadge: reminderState.pendingBadge });
    });
  },

  async onShow() {
    const app = getApp();
    if (app.globalData && app.globalData.isAdmin) chefOrderReminder.start();
    await this.loadOrders(true);
  },

  onUnload() {
    imageCache.releaseView(this);
    if (this._unsubscribeChefBadge) this._unsubscribeChefBadge();
  },

  async onPullDownRefresh() {
    await this.loadOrders(true);
    wx.stopPullDownRefresh();
  },

  async loadOrders(reset = false) {
    if (this.data.loadingMore) return;
    const offset = reset ? 0 : this.data.nextOffset;
    this.setData(reset
      ? { loading: true, errorMessage: '' }
      : { loadingMore: true, errorMessage: '' });
    try {
      const result = await orderService.listManageOrders({
        status: this.data.filter,
        limit: 20,
        offset,
      });
      const incoming = (result.items || []).map(normalizeOrder);
      imageCache.setImageData(this, {
        orders: reset ? incoming : [...this.data.orders, ...incoming],
        hasMore: Boolean(result.hasMore),
        nextOffset: result.nextOffset || 0,
      }, null, { queue: false });
    } catch (error) {
      console.error('管理员订单读取失败', error);
      this.setData({ errorMessage: error.message || '订单读取失败' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  changeFilter(event) {
    const filter = event.currentTarget.dataset.filter;
    if (filter === this.data.filter) return;
    this.setData({ filter, orders: [], nextOffset: 0 }, () => this.loadOrders(true));
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadOrders(false);
  },

  openOrder(event) {
    const orderId = event.currentTarget.dataset.orderid;
    if (!orderId) return;
    wx.navigateTo({
      url: `/package-order/order-detail/order-detail?id=${encodeURIComponent(orderId)}&manage=1`,
    });
  },
});
