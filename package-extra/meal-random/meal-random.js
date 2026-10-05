const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const cartService = require('../../services/cart');
const { decorateDetailDish } = require('../../utils/detail-presentation');
const { formatMoney } = require('../../utils/money');
const {
  MAX_FOOD_CATEGORY_COUNT,
  MAX_FOOD_CATEGORY_SELECTION,
  buildMealCandidates,
  generateCategoryGuidedMeal,
  getEligibleDrinkCategories,
  getEligibleFoodCategories,
  getFoodCategoryMaxCount,
  normalizeFoodCategoryCounts,
  toggleFoodCategorySelection,
} = require('../utils/meal-random');
const {
  cancelMealBatch,
  createMealBatch,
  currentMealBatchDish,
  emptySelectedOptions,
  getMealBatchSelections,
  isMealBatchComplete,
  needsMealCustomization,
  recordMealBatchSelection,
} = require('../utils/meal-batch');

function decorateMealItem(item) {
  const dish = decorateDetailDish(item.dish);
  return {
    ...item,
    dishId: dish.id,
    dish: {
      ...dish,
      displayTags: (Array.isArray(dish.tags) ? dish.tags : []).slice(0, 3),
      priceText: dish.price === null || dish.price === undefined ? '未标价' : `¥${formatMoney(dish.price)}`,
    },
  };
}

function decorateCategory(category = {}) {
  const icon = String(category.icon || '').trim();
  const isImage = /^(cloud:\/\/|https?:\/\/|\/images\/)/.test(icon);
  return {
    ...category,
    iconImage: isImage ? icon : '',
    iconText: icon && !isImage ? icon : '',
  };
}

function emptyResultData() {
  return {
    mealItems: [],
    recommendedFoodCount: 0,
    hasUnpricedItems: false,
    displayTotalAmountText: '0',
    totalDisplayText: '¥0',
  };
}

Page({
  ...imageCache.imageEventHandlers,
  data: {
    loading: true,
    refreshing: false,
    errorMessage: '',
    committing: false,
    batchActive: false,
    maxFoodCategorySelection: MAX_FOOD_CATEGORY_SELECTION,
    maxFoodCategoryCount: MAX_FOOD_CATEGORY_COUNT,
    step: 'food-category',
    foodCategories: [],
    drinkCategories: [],
    foodCategoryIds: [],
    selectedFoodCategoryCounts: {},
    selectedFoodTotalCount: 0,
    selectedFoodCategories: [],
    foodCategoryNamesText: '',
    includeDrink: null,
    drinkCategoryId: '',
    drinkCategoryName: '',
    mealItems: [],
    recommendedFoodCount: 0,
    hasUnpricedItems: false,
    displayTotalAmountText: '0',
    totalDisplayText: '¥0',
    drinkOptionVisible: false,
    drinkOptionDish: null,
    foodOptionVisible: false,
    foodOptionDish: null,
  },

  onLoad() {
    this.loadCatalog(true);
  },

  onUnload() { imageCache.releaseView(this); },

  async onPullDownRefresh() {
    try {
      await this.loadCatalog(true);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async fetchCatalog() {
    const [dishResult, categoryResult] = await Promise.all([
      catalogService.listDishes({ allowLocalFallback: false }),
      catalogService.listCategories({ allowLocalFallback: false }),
    ]);
    return { dishes: dishResult.items, categories: categoryResult.items };
  },

  applyCatalog(dishes, categories) {
    this.catalogDishes = Array.isArray(dishes) ? dishes : [];
    this.catalogCategories = Array.isArray(categories) ? categories : [];
    const selectedIds = new Set(this.data.foodCategoryIds || []);
    const selectedCounts = normalizeFoodCategoryCounts(
      this.data.selectedFoodCategoryCounts,
      this.data.foodCategoryIds || [],
    );
    const foodCategories = getEligibleFoodCategories(this.catalogDishes, this.catalogCategories)
      .map(category => ({
        ...decorateCategory(category),
        selected: selectedIds.has(category.id),
        selectedCount: selectedIds.has(category.id) ? selectedCounts[category.id] : 0,
        maxCount: getFoodCategoryMaxCount(this.catalogDishes, this.catalogCategories, category.id),
      }));
    const drinkCategories = getEligibleDrinkCategories(this.catalogDishes, this.catalogCategories)
      .map(decorateCategory);
    imageCache.setImageData(this, { foodCategories, drinkCategories });
    return { foodCategories, drinkCategories };
  },

  async loadCatalog(resetSelection = false) {
    if (this.data.refreshing || this.data.committing || this.data.batchActive) return;
    this.setData({ refreshing: true, errorMessage: '' });
    try {
      const { dishes, categories } = await this.fetchCatalog();
      this.applyCatalog(dishes, categories);
      if (resetSelection) this.resetSelection();
    } catch (error) {
      console.error('读取随机菜单失败', error);
      this.setData({ errorMessage: error.message || '暂时无法读取今日菜单' });
      wx.showToast({ title: error.message || '暂时无法读取今日菜单', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  onRetryLoad() {
    this.loadCatalog(true);
  },

  resetSelection() {
    this.setData({
      step: 'food-category',
      foodCategories: this.data.foodCategories.map(category => ({
        ...category,
        selected: false,
        selectedCount: 0,
      })),
      foodCategoryIds: [],
      selectedFoodCategoryCounts: {},
      selectedFoodTotalCount: 0,
      selectedFoodCategories: [],
      foodCategoryNamesText: '',
      includeDrink: null,
      drinkCategoryId: '',
      drinkCategoryName: '',
      ...emptyResultData(),
    });
  },

  applyFoodCategorySelection(foodCategoryIds, requestedCounts = this.data.selectedFoodCategoryCounts) {
    const idSet = new Set(foodCategoryIds);
    const selectedFoodCategoryCounts = normalizeFoodCategoryCounts(requestedCounts, foodCategoryIds);
    const selectedFoodCategories = this.data.foodCategories
      .filter(category => idSet.has(category.id))
      .map(category => ({ id: category.id, name: category.name }));
    this.setData({
      foodCategoryIds,
      selectedFoodCategoryCounts,
      selectedFoodTotalCount: foodCategoryIds.reduce((total, id) => total + selectedFoodCategoryCounts[id], 0),
      selectedFoodCategories,
      foodCategoryNamesText: selectedFoodCategories.map(category => category.name).join('、'),
      foodCategories: this.data.foodCategories.map(category => ({
        ...category,
        selected: idSet.has(category.id),
        selectedCount: idSet.has(category.id) ? selectedFoodCategoryCounts[category.id] : 0,
      })),
    });
  },

  onFoodCategoryToggle(event) {
    if (this.data.batchActive) return;
    const id = String(event.currentTarget.dataset.categoryid || '');
    const category = this.data.foodCategories.find(item => item.id === id);
    if (!category) return;
    const toggled = toggleFoodCategorySelection(
      this.data.foodCategoryIds,
      category.id,
      MAX_FOOD_CATEGORY_SELECTION,
    );
    if (toggled.limitReached) {
      wx.showToast({ title: `最多选择 ${MAX_FOOD_CATEGORY_SELECTION} 个分类`, icon: 'none' });
      return;
    }
    this.applyFoodCategorySelection(toggled.ids);
  },

  onFoodCountControlTap() {},

  onFoodCategoryCountChange(event) {
    if (this.data.batchActive) return;
    const id = String(event.currentTarget.dataset.categoryid || '');
    const delta = Number(event.currentTarget.dataset.delta);
    const category = this.data.foodCategories.find(item => item.id === id);
    if (!category || !category.selected || ![-1, 1].includes(delta)) return;
    const current = this.data.selectedFoodCategoryCounts[id] || 1;
    const next = Math.max(1, Math.min(category.maxCount, current + delta));
    if (next === current) return;
    this.applyFoodCategorySelection(this.data.foodCategoryIds, {
      ...this.data.selectedFoodCategoryCounts,
      [id]: next,
    });
  },

  onFoodCategoriesNext() {
    if (this.data.foodCategoryIds.length === 0) return;
    this.setData({
      step: 'drink-question',
      includeDrink: null,
      drinkCategoryId: '',
      drinkCategoryName: '',
      ...emptyResultData(),
    });
  },

  onChooseDrinkYes() {
    if (this.data.drinkCategories.length === 0) {
      wx.showToast({ title: '今天暂时没有可以推荐的饮品', icon: 'none' });
      this.setData({ includeDrink: false, drinkCategoryId: '', drinkCategoryName: '' }, () => {
        this.generateForSelection(false);
      });
      return;
    }
    this.setData({ step: 'drink-category', includeDrink: true, drinkCategoryId: '', drinkCategoryName: '' });
  },

  onChooseDrinkNo() {
    this.setData({ includeDrink: false, drinkCategoryId: '', drinkCategoryName: '' }, () => {
      this.generateForSelection(false);
    });
  },

  onDrinkCategorySelect(event) {
    if (this.data.batchActive) return;
    const id = String(event.currentTarget.dataset.categoryid || '');
    const category = this.data.drinkCategories.find(item => item.id === id);
    if (!category) return;
    this.setData({
      includeDrink: true,
      drinkCategoryId: category.id,
      drinkCategoryName: category.name,
    }, () => this.generateForSelection(false));
  },

  onBackStep() {
    if (this.data.step === 'drink-category') {
      this.setData({ step: 'drink-question', drinkCategoryId: '', drinkCategoryName: '' });
    } else if (this.data.step === 'drink-question') {
      this.setData({
        step: 'food-category',
        includeDrink: null,
      });
    }
  },

  onRestartSelection() {
    if (this.data.batchActive) return;
    this.setData({
      step: 'food-category',
      includeDrink: null,
      drinkCategoryId: '',
      drinkCategoryName: '',
      ...emptyResultData(),
    });
  },

  currentSelection() {
    return {
      foodCategoryIds: this.data.foodCategoryIds,
      foodCategoryCounts: this.data.selectedFoodCategoryCounts,
      includeDrink: this.data.includeDrink,
      drinkCategoryId: this.data.drinkCategoryId,
    };
  },

  previousResultIds() {
    const foodDishByCategory = {};
    this.data.mealItems
      .filter(item => item.dish.type === 'food')
      .forEach(item => {
        if (item.categoryId) {
          if (!foodDishByCategory[item.categoryId]) foodDishByCategory[item.categoryId] = [];
          foodDishByCategory[item.categoryId].push(item.dish.id);
        }
      });
    const drinkItem = this.data.mealItems.find(item => item.dish.type === 'drink');
    return {
      foodDishByCategory,
      drinkId: drinkItem ? drinkItem.dish.id : '',
    };
  },

  applyGeneratedMeal(result) {
    const amountText = formatMoney(result.displayTotalAmount);
    const totalDisplayText = result.hasUnpricedItems
      ? (result.displayTotalAmount > 0 ? `¥${amountText} + 部分商品未标价` : '部分商品未标价')
      : `¥${amountText}`;
    imageCache.setImageData(this, {
      step: 'result',
      mealItems: result.items.map(decorateMealItem),
      recommendedFoodCount: result.foodItems.length,
      hasUnpricedItems: result.hasUnpricedItems,
      displayTotalAmountText: amountText,
      totalDisplayText,
    });
  },

  returnToFoodSelection(missingCategory = {}) {
    const availableIds = new Set(this.data.foodCategories.map(category => category.id));
    const remainingIds = this.data.foodCategoryIds.filter(id => availableIds.has(id));
    this.applyFoodCategorySelection(remainingIds);
    this.setData({
      step: 'food-category',
      includeDrink: null,
      drinkCategoryId: '',
      drinkCategoryName: '',
      ...emptyResultData(),
    });
    const categoryName = String(missingCategory.name || '').trim();
    wx.showToast({
      title: categoryName
        ? `「${categoryName}」今天暂时没有可以推荐的菜了`
        : '请选择至少一个菜品分类',
      icon: 'none',
    });
  },

  generateForSelection(avoidCurrent = true) {
    const result = generateCategoryGuidedMeal(
      this.catalogDishes,
      this.catalogCategories,
      this.currentSelection(),
      avoidCurrent ? this.previousResultIds() : {},
    );
    if (result.missingFoodCandidates) {
      this.returnToFoodSelection(result.missingFoodCategory);
      return false;
    }
    if (result.missingDrinkCandidates) {
      wx.showToast({ title: '这个饮品分类暂时没有可推荐的饮品', icon: 'none' });
      this.setData({
        step: this.data.drinkCategories.length > 0 ? 'drink-category' : 'drink-question',
        drinkCategoryId: '',
        drinkCategoryName: '',
        ...emptyResultData(),
      });
      return false;
    }
    if (result.limitedFoodCategories.length > 0) {
      const counts = { ...this.data.selectedFoodCategoryCounts };
      result.limitedFoodCategories.forEach(category => { counts[category.id] = category.actualCount; });
      this.applyFoodCategorySelection(this.data.foodCategoryIds, counts);
      wx.showToast({
        title: `这个分类今天只有 ${result.limitedFoodCategories[0].actualCount} 道可选，已全部推荐`,
        icon: 'none',
        duration: 2500,
      });
    }
    this.applyGeneratedMeal(result);
    return true;
  },

  onShuffle() {
    if (this.data.refreshing || this.data.committing || this.data.batchActive) return;
    this.generateForSelection(true);
  },

  goDishDetail(event) {
    const dishId = event.currentTarget.dataset.dishid;
    if (dishId) wx.navigateTo({ url: `/package-extra/detail/detail?dishid=${encodeURIComponent(dishId)}` });
  },

  async onAcceptMeal() {
    if (this.data.committing || this.data.batchActive || this.data.mealItems.length === 0) return;
    this.setData({ committing: true });
    try {
      const { dishes, categories } = await this.fetchCatalog();
      const available = this.applyCatalog(dishes, categories);
      const selection = this.currentSelection();
      const validation = generateCategoryGuidedMeal(dishes, categories, selection);
      if (validation.missingFoodCandidates) {
        this.returnToFoodSelection(validation.missingFoodCategory);
        return;
      }
      if (validation.missingDrinkCandidates) {
        wx.showToast({ title: '这个饮品分类暂时没有可推荐的饮品', icon: 'none' });
        this.setData({
          step: available.drinkCategories.length > 0 ? 'drink-category' : 'drink-question',
          drinkCategoryId: '',
          drinkCategoryName: '',
          ...emptyResultData(),
        });
        return;
      }
      const freshCandidates = buildMealCandidates(dishes, categories);
      const candidateById = new Map(freshCandidates.map(dish => [dish.id, dish]));
      const selectedDishes = this.data.mealItems.map(item => {
        const freshDish = candidateById.get(item.dish.id);
        return freshDish && freshDish.categoryId === item.categoryId ? freshDish : null;
      });
      if (selectedDishes.some(dish => !dish)) {
        wx.showToast({ title: '菜品状态已变化，已重新推荐', icon: 'none' });
        this.generateForSelection(true);
        return;
      }
      this.latestCandidates = freshCandidates;
      this.mealBatch = createMealBatch(selectedDishes);
      this.setData({ batchActive: true });
      this.advanceMealBatch();
    } catch (error) {
      console.error('准备随机搭配失败', error);
      wx.showToast({ title: error.message || '无法读取最新菜单', icon: 'none' });
    } finally {
      this.setData({ committing: false });
    }
  },

  advanceMealBatch() {
    let dish = currentMealBatchDish(this.mealBatch);
    while (dish && !needsMealCustomization(dish)) {
      this.mealBatch = recordMealBatchSelection(this.mealBatch, emptySelectedOptions(dish.type));
      dish = currentMealBatchDish(this.mealBatch);
    }
    if (!dish && isMealBatchComplete(this.mealBatch)) {
      this.commitMealBatch();
      return;
    }
    if (!dish) return;
    if (dish.type === 'drink') {
      this.setData({ drinkOptionVisible: true, drinkOptionDish: dish });
    } else {
      this.setData({ foodOptionVisible: true, foodOptionDish: dish });
    }
  },

  onDrinkOptionsConfirm(event) {
    this.recordCustomization(event.detail, 'drink');
  },

  onFoodOptionsConfirm(event) {
    this.recordCustomization(event.detail, 'food');
  },

  recordCustomization(detail = {}, expectedType) {
    const dish = currentMealBatchDish(this.mealBatch);
    if (!dish || dish.type !== expectedType || dish.id !== detail.dishId) {
      this.cancelCustomization();
      wx.showToast({ title: '当前搭配已变化，请重试', icon: 'none' });
      return;
    }
    this.mealBatch = recordMealBatchSelection(this.mealBatch, detail.selectedOptions, detail.quantity);
    this.setData({
      drinkOptionVisible: false,
      drinkOptionDish: null,
      foodOptionVisible: false,
      foodOptionDish: null,
    }, () => this.advanceMealBatch());
  },

  cancelCustomization() {
    if (this.mealBatch) this.mealBatch = cancelMealBatch(this.mealBatch);
    this.mealBatch = null;
    this.setData({
      batchActive: false,
      drinkOptionVisible: false,
      drinkOptionDish: null,
      foodOptionVisible: false,
      foodOptionDish: null,
    });
    wx.showToast({ title: '已取消，本套未加入点菜单', icon: 'none' });
  },

  commitMealBatch() {
    const selections = getMealBatchSelections(this.mealBatch);
    if (selections.length === 0) return;
    try {
      const cart = cartService.addDishes(selections, { dishes: this.latestCandidates || [] });
      this.mealBatch = null;
      this.setData({ batchActive: false });
      wx.showToast({ title: '已加入点菜单', icon: 'success' });
      setTimeout(() => {
        wx.navigateTo({ url: '/package-order/order-confirm/order-confirm' });
      }, 450);
      return cart;
    } catch (error) {
      console.error('随机搭配加入点菜单失败', error);
      this.mealBatch = null;
      this.setData({ batchActive: false });
      wx.showToast({ title: error.message || '加入点菜单失败', icon: 'none' });
      return null;
    }
  },
});
