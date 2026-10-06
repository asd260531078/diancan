// package-admin/manage/manage.js
const app = getApp();
const authService = require('../../services/auth');
const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const chefOrderReminder = require('../../services/chef-order-reminder');
const notifySubscription = require('../../services/order-notify-subscription');

// 菜多时分批渲染，滚到底再追加。
const MANAGE_PAGE_SIZE = 30;

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
    searchKey: '',
    totalCount: 0,
    hasMore: false,
    notifyConfigured: notifySubscription.isConfigured(),
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
    clearTimeout(this._searchTimer);
    imageCache.releaseView(this);
    if (this._unsubscribeChefBadge) this._unsubscribeChefBadge();
  },

  async initialize() {
    // 已加载过：后台静默刷新，不再整页变成“正在连接”。
    const silent = this.data.isAuthorized && Array.isArray(this._allDishes);
    this.setData({ loading: !silent, hasLegacyDishes: catalogService.getLocalDishes().length > 0 });
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
    const [dishResult, firstCategoryResult] = await Promise.all([
      catalogService.listDishes({ includeDisabled: true, allowLocalFallback: false }),
      catalogService.listCategories({ includeDisabled: true, allowLocalFallback: false }),
    ]);
    let categoryResult = firstCategoryResult;
    if (categoryResult.items.length === 0) {
      await catalogService.seedDefaultCategories();
      categoryResult = await catalogService.listCategories({ includeDisabled: true, allowLocalFallback: false });
    }
    this._allDishes = dishResult.items;
    this.setData({ categories: categoryResult.items });
    this.renderDishList();
  },

  filteredDishes() {
    const key = String(this.data.searchKey || '').trim().toLowerCase();
    const all = this._allDishes || [];
    return key ? all.filter(dish => String(dish.name || '').toLowerCase().includes(key)) : all;
  },

  // 只渲染已滚到的部分（至少保留当前已显示的数量，刷新后不跳回顶部）。
  renderDishList(minCount = MANAGE_PAGE_SIZE) {
    const list = this.filteredDishes();
    const count = Math.max(minCount, Math.min(this.data.dishes.length, list.length));
    imageCache.setImageData(this, {
      dishes: list.slice(0, count),
      totalCount: list.length,
      hasMore: list.length > count,
      loading: false,
    });
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    this.renderDishList(this.data.dishes.length + MANAGE_PAGE_SIZE);
  },

  onSearchInput(event) {
    this.setData({ searchKey: event.detail.value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.setData({ dishes: [] });
      this.renderDishList();
    }, 150);
  },

  onAddDish() {
    if (!this.data.isAuthorized) return;
    wx.navigateTo({ url: '/package-admin/dish-edit/dish-edit' });
  },

  onManageCategories() {
    if (!this.data.isAuthorized) return;
    wx.navigateTo({ url: '/package-admin/category-manage/category-manage' });
  },

  // 必须由点击直接触发，微信才会弹出订阅授权。
  onEnableOrderNotify() {
    notifySubscription.requestNewOrderSubscription({ explicit: true });
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
    // 开关已经在界面上切换了：先本地更新这一道菜，再写云端，不整表重载。
    const index = this.data.dishes.findIndex(item => item.id === dishId);
    const cached = (this._allDishes || []).find(item => item.id === dishId);
    if (cached) cached[field] = value;
    if (index >= 0) this.setData({ [`dishes[${index}].${field}`]: value });
    try {
      await catalogService.updateDish(dishId, { [field]: value });
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
