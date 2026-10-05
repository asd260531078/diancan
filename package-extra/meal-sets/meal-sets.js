const mealSetService = require('../services/meal-sets');
const imageCache = require('../../services/imageCache');
const { decorateMealSet } = require('../utils/meal-set');

Page({
  ...imageCache.imageEventHandlers,
  data: { loading: true, errorMessage: '', mealSets: [] },

  onUnload() { imageCache.releaseView(this); },

  async onShow() {
    await this.loadData();
  },

  async onPullDownRefresh() {
    try { await this.loadData(); } finally { wx.stopPullDownRefresh(); }
  },

  async loadData() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await mealSetService.listMealSets();
      imageCache.setImageData(this, {
        mealSets: result.items.map(item => decorateMealSet(item, result.dishes, result.categories)),
      });
    } catch (error) {
      console.error('套餐列表读取失败', error);
      this.setData({ mealSets: [], errorMessage: error.message || '套餐读取失败' });
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
