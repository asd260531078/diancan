const cartService = require('../../services/cart');
const imageCache = require('../../services/imageCache');
const mealSetService = require('../services/meal-sets');
const { decorateMealSet } = require('../utils/meal-set');
const {
  cancelMealBatch,
  createMealBatch,
  currentMealBatchDish,
  currentMealBatchQuantity,
  emptySelectedOptions,
  getMealBatchSelections,
  isMealBatchComplete,
  needsMealCustomization,
  recordMealBatchSelection,
} = require('../utils/meal-batch');

Page({
  ...imageCache.imageEventHandlers,
  data: {
    loading: true,
    errorMessage: '',
    committing: false,
    batchActive: false,
    mealSet: null,
    drinkOptionVisible: false,
    drinkOptionDish: null,
    foodOptionVisible: false,
    foodOptionDish: null,
    currentOptionQuantity: 1,
  },

  onLoad(options = {}) {
    this.mealSetId = String(options.id || '');
    this.loadDetail();
  },

  onUnload() { imageCache.releaseView(this); },

  async onPullDownRefresh() {
    try { await this.loadDetail(); } finally { wx.stopPullDownRefresh(); }
  },

  async loadDetail() {
    if (!this.mealSetId) {
      this.setData({ loading: false, mealSet: null, errorMessage: '套餐不存在' });
      return;
    }
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await mealSetService.getMealSetDetail(this.mealSetId);
      const mealSet = decorateMealSet(result.item, result.dishes, result.categories);
      this.latestDishes = result.dishes;
      imageCache.setImageData(this, { mealSet });
    } catch (error) {
      console.error('套餐详情读取失败', error);
      wx.showToast({ title: error.message || '套餐不存在或已停用', icon: 'none' });
      this.setData({ mealSet: null, errorMessage: error.message || '套餐不存在或已停用' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRetryLoad() {
    this.loadDetail();
  },

  goDishDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/package-extra/detail/detail?dishid=${encodeURIComponent(id)}` });
  },

  async onAcceptSet() {
    if (this.data.loading || this.data.committing || this.data.batchActive || !this.data.mealSet || !this.data.mealSet.canOrder) return;
    this.setData({ committing: true });
    try {
      const result = await mealSetService.getMealSetDetail(this.mealSetId);
      const mealSet = decorateMealSet(result.item, result.dishes, result.categories);
      this.latestDishes = result.dishes;
      imageCache.setImageData(this, { mealSet });
      if (!mealSet.canOrder) {
        wx.showToast({ title: '套餐商品状态已变化，请查看提示', icon: 'none' });
        return;
      }
      this.mealBatch = createMealBatch(mealSet.items.map(item => ({
        dish: item.dish,
        quantity: item.quantity,
      })));
      this.setData({ batchActive: true });
      this.advanceBatch();
    } catch (error) {
      wx.showToast({ title: error.message || '无法读取最新套餐', icon: 'none' });
    } finally {
      this.setData({ committing: false });
    }
  },

  advanceBatch() {
    let dish = currentMealBatchDish(this.mealBatch);
    while (dish && !needsMealCustomization(dish)) {
      this.mealBatch = recordMealBatchSelection(this.mealBatch, emptySelectedOptions(dish.type));
      dish = currentMealBatchDish(this.mealBatch);
    }
    if (!dish && isMealBatchComplete(this.mealBatch)) {
      this.commitBatch();
      return;
    }
    if (!dish) return;
    const currentOptionQuantity = currentMealBatchQuantity(this.mealBatch);
    if (dish.type === 'drink') {
      this.setData({ drinkOptionVisible: true, drinkOptionDish: dish, currentOptionQuantity });
    } else {
      this.setData({ foodOptionVisible: true, foodOptionDish: dish, currentOptionQuantity });
    }
  },

  onDrinkConfirm(event) { this.recordCustomization(event.detail, 'drink'); },
  onFoodConfirm(event) { this.recordCustomization(event.detail, 'food'); },

  recordCustomization(detail = {}, type) {
    const dish = currentMealBatchDish(this.mealBatch);
    if (!dish || dish.type !== type || dish.id !== detail.dishId) {
      this.cancelBatch();
      return;
    }
    this.mealBatch = recordMealBatchSelection(this.mealBatch, detail.selectedOptions, detail.quantity);
    this.setData({
      drinkOptionVisible: false,
      drinkOptionDish: null,
      foodOptionVisible: false,
      foodOptionDish: null,
      currentOptionQuantity: 1,
    }, () => this.advanceBatch());
  },

  cancelBatch() {
    if (this.mealBatch) this.mealBatch = cancelMealBatch(this.mealBatch);
    this.mealBatch = null;
    this.setData({
      batchActive: false,
      drinkOptionVisible: false,
      drinkOptionDish: null,
      foodOptionVisible: false,
      foodOptionDish: null,
      currentOptionQuantity: 1,
    });
    wx.showToast({ title: '已取消，本套餐未加入点菜单', icon: 'none' });
  },

  commitBatch() {
    const selections = getMealBatchSelections(this.mealBatch);
    if (!selections.length) return;
    try {
      cartService.addDishes(selections, { dishes: this.latestDishes || [] });
      this.mealBatch = null;
      this.setData({ batchActive: false });
      wx.showToast({ title: '套餐已加入点菜单', icon: 'success' });
      setTimeout(() => wx.navigateTo({ url: '/package-order/order-confirm/order-confirm' }), 450);
    } catch (error) {
      this.mealBatch = null;
      this.setData({ batchActive: false });
      wx.showToast({ title: error.message || '加入点菜单失败', icon: 'none' });
    }
  },
});
