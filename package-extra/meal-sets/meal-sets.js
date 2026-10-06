const mealSetService = require('../services/meal-sets');
const imageCache = require('../../services/imageCache');
const { decorateMealSet } = require('../utils/meal-set');

const RELOAD_INTERVAL_MS = 30 * 1000;

Page({
  ...imageCache.imageEventHandlers,
  data: { loading: true, errorMessage: '', mealSets: [] },

  onUnload() { imageCache.releaseView(this); },

  async onShow() {
    // 从套餐详情返回时，30 秒内不重复拉取。
    if (this._loadedAt && Date.now() - this._loadedAt < RELOAD_INTERVAL_MS) return;
    await this.loadData();
  },

  async onPullDownRefresh() {
    try { await this.loadData(); } finally { wx.stopPullDownRefresh(); }
  },

  async loadData() {
    // 已有列表时静默刷新，不再整页切回“加载中”。
    if (!this.data.mealSets.length) this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await mealSetService.listMealSets();
      this._loadedAt = Date.now();
      imageCache.setImageData(this, {
        errorMessage: '',
        mealSets: result.items.map(item => decorateMealSet(item, result.dishes, result.categories)),
      });
    } catch (error) {
      console.error('套餐列表读取失败', error);
      // 静默刷新失败时保留已显示的套餐。
      if (!this.data.mealSets.length) this.setData({ mealSets: [], errorMessage: error.message || '套餐读取失败' });
      wx.showToast({ title: error.message || '套餐读取失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetryLoad() {
    this.loadData();
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/package-extra/meal-set-detail/meal-set-detail?id=${encodeURIComponent(id)}` });
  },
});
