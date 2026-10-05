// package-admin/manage/manage.js
const app = getApp();
const authService = require('../../services/auth');
const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const chefOrderReminder = require('../../services/chef-order-reminder');

const QUICK_STATUS_MESSAGES = {
  enabled: { true: '已上架', false: '已下架' },
  availableToday: { true: '今天可做', false: '今天不做' },
  soldOut: { true: '已设为售罄', false: '已取消售罄' },
};

Page({
  ...imageCache.imageEventHandlers,
  data: {
    isAuthorized: false,
    loading: true,
    dishes: [],
    categories: [],
    hasLegacyDishes: false,
    chefPendingBadge: '',
  },

  onLoad() {
    this._unsubscribeChefBadge = chefOrderReminder.subscribe(reminderState => {
      this.setData({ chefPendingBadge: reminderState.pendingBadge });
    });
  },

  async onShow() {
    await this.initialize();
  },

  onUnload() {
    imageCache.releaseView(this);
    if (this._unsubscribeChefBadge) this._unsubscribeChefBadge();
  },

  async initialize() {
    this.setData({ loading: true, hasLegacyDishes: catalogService.getLocalDishes().length > 0 });
    try {
      // 页面结果仅控制显示；所有写操作仍由云函数 assertAdmin 再校验。
      const session = await authService.getSession(true);
      app.globalData.openid = session.openid;
      app.globalData.isAdmin = session.isAdmin;
      if (!session.isAdmin) {
        chefOrderReminder.reset();
        this.setData({ isAuthorized: false, loading: false });
        wx.showModal({
          title: '⚠️ 无权访问',
          content: '当前微信账号不是云端管理员。',
          showCancel: false,
          success: () => wx.switchTab({ url: '/pages/menu/menu' }),
        });
        return;
      }
      this.setData({ isAuthorized: true });
      chefOrderReminder.start();
      await this.loadCatalog();
    } catch (error) {
      console.error('管理端初始化失败', error);
      chefOrderReminder.reset();
      this.setData({ isAuthorized: false, loading: false });
      wx.showModal({ title: '初始化失败', content: error.message || '无法连接云服务', showCancel: false });
    }
  },

  async loadCatalog() {
    const dishResult = await catalogService.listDishes({ includeDisabled: true, allowLocalFallback: false });
    let categoryResult = await catalogService.listCategories({ includeDisabled: true, allowLocalFallback: false });
    if (categoryResult.items.length === 0) {
      await catalogService.seedDefaultCategories();
      categoryResult = await catalogService.listCategories({ includeDisabled: true, allowLocalFallback: false });
    }
    imageCache.setImageData(this, { dishes: dishResult.items, categories: categoryResult.items, loading: false });
  },

  onAddDish() {
    if (!this.data.isAuthorized) return;
    wx.navigateTo({ url: '/package-admin/dish-edit/dish-edit' });
  },

  onManageCategories() {
    if (!this.data.isAuthorized) return;
    wx.navigateTo({ url: '/package-admin/category-manage/category-manage' });
  },

  onManageOrders() {
    if (!this.data.isAuthorized) return;
    wx.navigateTo({ url: '/package-admin/manage-orders/manage-orders' });
  },

  onManageMealSets() {
    if (!this.data.isAuthorized) return;
    wx.navigateTo({ url: '/package-admin/meal-set-manage/meal-set-manage' });
  },

  onEditDish(event) {
    if (!this.data.isAuthorized) return;
    const dishId = event.currentTarget.dataset.dishid;
    if (!dishId) return;
    wx.navigateTo({ url: `/package-admin/dish-edit/dish-edit?id=${encodeURIComponent(dishId)}` });
  },

  onDeleteDish(event) {
    if (!this.data.isAuthorized) return;
    const dishId = event.currentTarget.dataset.dishid;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这道菜吗？已上传的图片暂时不会从云存储自动清理。',
      success: async result => {
        if (!result.confirm) return;
        try {
          await catalogService.deleteDish(dishId);
          await this.loadCatalog();
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      },
    });
  },

  async onToggleDishStatus(event) {
    if (!this.data.isAuthorized) return;
    const dishId = event.currentTarget.dataset.dishid;
    const field = event.currentTarget.dataset.field;
    if (!['enabled', 'availableToday', 'soldOut'].includes(field)) return;
    const value = Boolean(event.detail.value);
    try {
      await catalogService.updateDish(dishId, { [field]: value });
      await this.loadCatalog();
      wx.showToast({ title: QUICK_STATUS_MESSAGES[field][String(value)], icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
      await this.loadCatalog();
    }
  },

  onImportLegacy() {
    if (!this.data.isAuthorized) return;
    const legacyDishes = wx.getStorageSync('dishes') || [];
    if (!legacyDishes.length) {
      wx.showToast({ title: '本机没有旧菜品数据', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '导入本机旧菜品',
      content: `将尝试导入 ${legacyDishes.length} 道菜。相同旧 ID 的云端菜品会跳过，本机数据不会被删除。`,
      success: async result => {
        if (!result.confirm) return;
        wx.showLoading({ title: '导入中...' });
        try {
          const summary = await catalogService.importLegacyDishes(legacyDishes, false);
          await this.loadCatalog();
          wx.showModal({
            title: '导入完成',
            content: `新增 ${summary.imported}，跳过 ${summary.skipped}，失败 ${summary.failed}`,
            showCancel: false,
          });
        } catch (error) {
          wx.showToast({ title: error.message || '导入失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});
