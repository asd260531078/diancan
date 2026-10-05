// pages/menu/menu.js
const app = getApp();
const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const cartService = require('../../services/cart');
const { dishStatusView, getDishRestriction } = require('../../utils/dish-status');
const { hasDrinkOptions, hasFoodOptions } = require('../../utils/cart');
const { formatMoney } = require('../../utils/money');
const { DEFAULT_COVER, safeDetailImage } = require('../../utils/detail-presentation');
const { getMenuCategoryIcon } = require('../../config/menu-category-icons');

const SPICY_TEXT = {
  mild: '🌶 微辣',
  medium: '🌶🌶 中辣',
  hot: '🌶🌶🌶 辣',
};

const CATEGORY_ICON_GLYPHS = {
  signature: '✦', home: '⌂', rice: '饭', soup: '汤', drink: '杯',
  coffee: '咖', dessert: '甜', snack: '点', noodle: '面', noodles: '面',
  meat: '肉', vegetable: '菜', main: '菜', staple: '饭',
};
const EAGER_MENU_IMAGE_COUNT = 8;
const ALL_CATEGORY_ID = 'all';

function categoryIdValue(value) {
  return value === undefined || value === null ? '' : String(value);
}

function categoryIdOf(category) {
  return categoryIdValue(category.id === undefined || category.id === null || category.id === ''
    ? category._id : category.id);
}

function categoryIconText(icon) {
  const value = String(icon || '').trim();
  if (!value || /^(cloud:\/\/|https:\/\/|\/images\/)/.test(value)) return '';
  return CATEGORY_ICON_GLYPHS[value.toLowerCase()] || (Array.from(value).length <= 2 ? value : '');
}

function decorateDish(dish, cachedCover) {
  const tags = Array.isArray(dish.tags) ? dish.tags : [];
  const status = dishStatusView(dish);
  return {
    ...dish,
    // View-only alias: legacy/local dishes use id; database fields are not changed.
    _id: dish._id || dish.id,
    ...status,
    displayTags: tags.filter(tag => tag !== '招牌' && tag !== '推荐').slice(0, 3),
    spicyText: SPICY_TEXT[dish.spicyLevel] || '',
    canAddToCart: status.canOrder,
    displayCover: cachedCover === undefined
      ? imageCache.getDisplayImage(safeDetailImage(dish.cover || dish.image, '菜单图片', dish.id) || DEFAULT_COVER)
      : cachedCover,
    nameSegments: [{ key: 'full', text: dish.name, highlight: false }],
  };
}

function cardView(dish) {
  // Panels repeat only small UI fields, not recipes/steps/detail images. Cart and
  // options still look up the original full dish in data.dishes by id.
  const view = {};
  ['id', '_id', 'name', 'cover', 'legacyCover', 'image', 'displayCover', 'description',
    'price', 'signature', 'recommended', 'spicyText', 'displayTags', 'canAddToCart',
    'restrictionText', 'restrictionKey', 'categoryId', 'nameSegments', 'searchHidden', 'eagerImage']
    .forEach(key => { if (dish[key] !== undefined) view[key] = dish[key]; });
  // Normalize the UI projection only; raw dish/category fields stay unchanged.
  view.categoryId = categoryIdValue(dish.categoryId);
  return view;
}

Page({
  ...imageCache.imageEventHandlers,
  data: {
    viewMode: 'home',
    catalogLoading: true,
    catalogError: false,
    menuReady: false,
    featuredDishes: [],
    previewDishes: [],
    categories: [{ id: ALL_CATEGORY_ID, name: '全部' }],
    activeCategoryId: ALL_CATEGORY_ID,
    categoryPanels: [],
    dishes: [],
    cart: [],
    cartCount: 0,
    totalAmount: 0,
    totalAmountText: '0',
    showCart: false,
    popularDishes: [], // 常点菜品
    searchKey: '',     // 搜索关键词
    drinkOptionVisible: false,
    drinkOptionDish: null,
    drinkOptionInitialOptions: null,
    drinkOptionInitialQuantity: 1,
    editingCartItemId: '',
    foodOptionVisible: false,
    foodOptionDish: null,
    foodOptionInitialOptions: null,
    foodOptionInitialQuantity: 1,
    editingFoodCartItemId: '',
  },

  onLoad(options = {}) {
    // 同一 Tab 的视图入口，不新增路由或更改分类数据。
    if (options.view === 'menu') this.setData({ viewMode: 'menu' });
    // 从 url 参数读取搜索词
    if (options.searchKey) {
      this.setData({ searchKey: decodeURIComponent(options.searchKey), viewMode: 'menu' });
    }
    const cached = catalogService.getCachedCatalog();
    if (cached.dishes.length) {
      this.applyCatalogView(cached.dishes, cached.categories);
      this.setData({ catalogLoading: false });
    }
  },

  onUnload() {
    imageCache.releaseView(this);
  },

  setMenuImageData(data, callback) {
    imageCache.setImageData(this, data, callback, { queue: false });
  },

  activeDishes() {
    const index = this._panelIndexByCategory && this._panelIndexByCategory.get(this.data.activeCategoryId);
    const panel = index === undefined ? null : this.data.categoryPanels[index];
    return panel ? panel.dishes.filter(dish => !dish.searchHidden) : [];
  },

  categoryVisitPatch(categoryId) {
    const index = this._panelIndexByCategory && this._panelIndexByCategory.get(categoryId);
    if (index === undefined || this.data.categoryPanels[index].visited) return {};
    return { [`categoryPanels[${index}].visited`]: true };
  },

  visibleCoverIDs() {
    const visible = this.data.viewMode === 'home'
      ? [...this.data.featuredDishes, ...this.data.previewDishes, ...this.data.popularDishes]
      : this.activeDishes().filter((dish, index) => index < EAGER_MENU_IMAGE_COUNT
        || (this._seenCoverIDs && this._seenCoverIDs.has(dish.cover || dish.image)));
    if (this.data.showCart) visible.push(...this.data.cart);
    return visible.map(dish => dish.cover || dish.image).filter(Boolean);
  },

  cacheVisibleCovers() {
    imageCache.queueCaches(this.visibleCoverIDs());
  },

  onDishImageLoad(event) {
    const source = event.currentTarget.dataset.cover;
    const visible = this.data.viewMode === 'home'
      ? [...this.data.featuredDishes, ...this.data.previewDishes, ...this.data.popularDishes]
      : this.activeDishes();
    if (this.data.showCart) visible.push(...this.data.cart);
    if (visible.some(dish => (dish.cover || dish.image) === source)) {
      if (!this._seenCoverIDs) this._seenCoverIDs = new Set();
      if (this._seenCoverIDs.has(source)) return;
      this._seenCoverIDs.add(source);
      imageCache.queueCache(source);
    }
  },

  switchView(e) {
    const viewMode = e.currentTarget.dataset.view === 'menu' ? 'menu' : 'home';
    if (viewMode === this.data.viewMode) return;
    this.setData({ viewMode, ...(viewMode === 'menu' ? this.categoryVisitPatch(this.data.activeCategoryId) : {}) });
    this.syncTabSelection();
    this.cacheVisibleCovers();
  },

  goAllMenu() {
    const hadSearch = Boolean(this.data.searchKey);
    this.setData({ viewMode: 'menu', activeCategoryId: ALL_CATEGORY_ID, searchKey: '', ...this.categoryVisitPatch(ALL_CATEGORY_ID) });
    if (hadSearch) this.filterDishes();
    this.syncTabSelection();
    this.cacheVisibleCovers();
  },

  syncTabSelection() {
    if (typeof this.selectComponent !== 'function') return;
    const tabBar = this.selectComponent('#menu-tab-bar');
    if (tabBar) tabBar.syncSelected();
  },

  retryCatalog() {
    return this.loadCatalog();
  },

  onDishImageError(e) {
    const dishId = e.currentTarget.dataset.dishid;
    const dish = this.data.dishes.find(item => item.id === dishId);
    if (!dish || dish.displayCover === DEFAULT_COVER) return;
    imageCache.handleImageError(this, e.currentTarget.dataset.cover || dish.cover || dish.image, DEFAULT_COVER, e.currentTarget.dataset.src);
  },

  onCategoryIconError(e) {
    const categoryId = e.currentTarget.dataset.categoryid;
    const category = this.data.categories.find(item => item.id === categoryId);
    if (category) imageCache.handleImageError(this, category.displayIcon, '', e.currentTarget.dataset.src);
  },

  goMealRandom() {
    wx.navigateTo({ url: '/package-extra/meal-random/meal-random' });
  },

  goMealSets() {
    wx.navigateTo({ url: '/package-extra/meal-sets/meal-sets' });
  },

  async onShow() {
    const requestedView = app.globalData.menuTabView;
    if (requestedView === 'home' || requestedView === 'menu') {
      app.globalData.menuTabView = null;
      this.setData({ viewMode: requestedView,
        ...(requestedView === 'menu' ? this.categoryVisitPatch(this.data.activeCategoryId) : {}) });
    }
    this.syncTabSelection();
    const revision = typeof catalogService.getCatalogRevision === 'function'
      ? catalogService.getCatalogRevision() : 0;
    if (this._catalogLoaded && this._lastCatalogRevision === revision) {
      this.refreshCart(this.data.dishes);
      this.calculatePopularDishes();
      this.resumePendingCartEdit();
      return;
    }
    // Ordinary re-entry keeps mounted panels and src. Only initial load, explicit
    // refresh or a catalog write revision fetches menu data again.
    const dishes = await this.loadCatalog();
    this.refreshCart(Array.isArray(dishes) ? dishes : this.data.dishes);
    // 只在页面重新显示时刷新常点数据
    this.calculatePopularDishes();
    this.resumePendingCartEdit();
  },

  // 统一通过 catalog service 读取。云函数未部署时，service 会只读回退到本机旧数据。
  applyCatalogView(dishItems, categoryItems) {
    return this.initMenuState(categoryItems, dishItems);
  },

  initMenuState(categoryItems, dishItems) {
    const categories = [{ id: ALL_CATEGORY_ID, name: '全部' }, ...categoryItems
      .filter(category => category.enabled !== false && categoryIdOf(category)
        && categoryIdOf(category) !== ALL_CATEGORY_ID)].map(category => ({
      ...category,
      id: categoryIdOf(category),
      displayIcon: getMenuCategoryIcon(category)
        || (/^(cloud:\/\/|https:\/\/|\/images\/)/.test(category.icon || '') ? category.icon : ''),
      displayIconText: categoryIconText(category.icon),
    }));
    const previousCache = this._dishViewCache || new Map();
    const previousSignatures = this._dishSourceSignatures || new Map();
    const signatures = new Map();
    const dishes = dishItems.map((dish, index) => {
      const id = dish.id || dish._id;
      const signature = JSON.stringify(dish);
      signatures.set(id, signature);
      const cached = previousSignatures.get(id) === signature && previousCache.get(id);
      return { ...decorateDish(dish, cached ? cached.displayCover : undefined), eagerImage: index < EAGER_MENU_IMAGE_COUNT,
        searchHidden: Boolean(this.data.searchKey && !dish.name.toLowerCase().includes(this.data.searchKey.toLowerCase())),
        nameSegments: this.getHighlightSegments(dish) };
    });
    const cards = dishes.map(dish => previousSignatures.get(dish.id || dish._id) === signatures.get(dish.id || dish._id)
      && previousCache.has(dish.id || dish._id) ? previousCache.get(dish.id || dish._id) : cardView(dish));
    const requestedCategoryId = categoryIdValue(this.data.activeCategoryId);
    const categoryStillAvailable = categories.some(item => item.id === requestedCategoryId);
    const activeCategoryId = categoryStillAvailable ? requestedCategoryId : ALL_CATEGORY_ID;
    // panel.visited is the sole residency state. Initialize the active panel even
    // while on home: the bottom TabBar can reveal menu without invoking onShow.
    const visited = new Set(this.data.categoryPanels.filter(panel => panel.visited)
      .map(panel => categoryIdValue(panel.categoryId)));
    visited.add(activeCategoryId);
    const byCategory = new Map(categories.map(category => [category.id, []]));
    byCategory.set(ALL_CATEGORY_ID, cards);
    cards.forEach(dish => {
      if (dish.categoryId !== ALL_CATEGORY_ID && byCategory.has(dish.categoryId)) byCategory.get(dish.categoryId).push(dish);
    });
    const categoryPanels = categories.map(category => {
      const items = byCategory.get(category.id);
      return { categoryId: category.id, name: category.id === ALL_CATEGORY_ID ? '全部菜单' : category.name,
        dishes: items, visited: visited.has(category.id), visibleCount: items.filter(dish => !dish.searchHidden).length };
    });
    this._panelIndexByCategory = new Map(categoryPanels.map((panel, index) => [panel.categoryId, index]));
    this._catalogSignature = JSON.stringify([dishItems, categoryItems]);
    // Business data and the renderable default panel are committed atomically.
    // No download/resolve/init promise is awaited before menuReady becomes true.
    this.setMenuImageData({ dishes, categories, activeCategoryId, categoryPanels, menuReady: true, catalogError: false,
      featuredDishes: dishes.filter(dish => dish.signature || dish.recommended).slice(0, 3),
      previewDishes: dishes.slice(0, 4) });
    this._allDishes = this.data.categoryPanels[0].dishes;
    this._dishViewCache = new Map(this._allDishes.map(dish => [dish.id || dish._id, dish]));
    this._dishSourceSignatures = signatures;
    this._dishesByCategory = new Map(categories.map(category => [category.id,
      category.id === ALL_CATEGORY_ID ? this._allDishes : this._allDishes.filter(dish => dish.categoryId === category.id)]));
    this.logMenuInit();
    this.calculatePopularDishes();
    this.cacheVisibleCovers();
    return this.data.dishes;
  },

  logMenuInit() {
    if (typeof console.log !== 'function') return;
    try {
      if (typeof wx.getAccountInfoSync === 'function'
        && wx.getAccountInfoSync().miniProgram.envVersion === 'release') return;
    } catch (_) { /* Diagnostics must never block rendering. */ }
    const defaultPanel = this.data.categoryPanels.find(panel => panel.categoryId === this.data.activeCategoryId);
    console.log('[menu INIT]', {
      categories: this.data.categories.length,
      dishes: this.data.dishes.length,
      panels: this.data.categoryPanels.length,
      activeCategoryId: this.data.activeCategoryId,
      visitedCategoryIds: this.data.categoryPanels.filter(panel => panel.visited).map(panel => panel.categoryId),
      defaultPanelDishes: defaultPanel ? defaultPanel.dishes.length : 0,
    });
  },

  async loadCatalog() {
    if (this._catalogPromise) return this._catalogPromise;
    const hadDishes = this.data.dishes.length > 0;
    const revision = typeof catalogService.getCatalogRevision === 'function'
      ? catalogService.getCatalogRevision() : 0;
    if (!hadDishes) this.setData({ catalogLoading: true, catalogError: false });
    const request = (async () => {
      try {
        const [dishResult, categoryResult] = await Promise.all([
          catalogService.listDishes(),
          catalogService.listCategories(),
        ]);
        const signature = JSON.stringify([dishResult.items, categoryResult.items]);
        const currentCategoryAvailable = this.data.activeCategoryId === ALL_CATEGORY_ID
          || categoryResult.items.some(item => item.enabled !== false && categoryIdOf(item) === this.data.activeCategoryId);
        if (hadDishes && signature === this._catalogSignature && currentCategoryAvailable) {
          if (this.data.catalogError) this.setData({ catalogError: false });
          this._lastCatalogRevision = revision;
          this._catalogLoaded = true;
          return this.data.dishes;
        }
        const dishes = this.applyCatalogView(dishResult.items, categoryResult.items);
        this._lastCatalogRevision = revision;
        this._catalogLoaded = true;
        return dishes;
      } catch (error) {
        this.setData({ catalogError: true });
        console.error('加载菜单失败', error);
        wx.showToast({ title: error.message || '菜单加载失败', icon: 'none' });
        return this.data.dishes;
      } finally {
        if (!hadDishes) this.setData({ catalogLoading: false });
      }
    })();
    this._catalogPromise = request;
    try {
      return await request;
    } finally {
      this._catalogPromise = null;
    }
  },

  refreshCart(dishes) {
    const cart = cartService.loadCart({ dishes: dishes || [] });
    this.applyCart(cart);
  },

  applyCart(cart) {
    this.setMenuImageData({
      cart,
      cartCount: cartService.getItemCount(cart),
      totalAmount: cartService.getTotalAmount(cart),
      totalAmountText: formatMoney(cartService.getTotalAmount(cart)),
    });
  },

  resumePendingCartEdit() {
    const pending = app.globalData.pendingCartEdit;
    if (!pending || !pending.cartItemId) return;
    app.globalData.pendingCartEdit = null;
    const cartItem = this.data.cart.find(item => item.cartItemId === pending.cartItemId);
    if (!cartItem) {
      wx.showToast({ title: '该点菜单项目已不存在', icon: 'none' });
      return;
    }
    const dish = this.data.dishes.find(item => item.id === cartItem.dishId);
    if (!dish) {
      wx.showToast({ title: '菜品已下架，无法修改', icon: 'none' });
      return;
    }
    const restriction = getDishRestriction(dish);
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return;
    }
    this.setData({ showCart: false });
    if (cartItem.type === 'drink' && hasDrinkOptions(dish)) {
      this.openDrinkOptions(dish, cartItem);
    } else if (cartItem.type === 'food' && hasFoodOptions(dish)) {
      this.openFoodOptions(dish, cartItem);
    } else {
      wx.showToast({ title: '该项目暂无可修改规格', icon: 'none' });
    }
  },

  // 计算常点菜品（返回菜品对象数组，而非仅 dishId 字符串数组）
  calculatePopularDishes() {
    const orders = wx.getStorageSync('orders') || [];
    const dishes = this.data.dishes;
    const dishCount = {};

    orders.forEach(order => {
      if (order.items) {
        order.items.forEach(item => {
          dishCount[item.dishId] = (dishCount[item.dishId] || 0) + item.num;
        });
      }
    });

    const sorted = Object.entries(dishCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // 将 dishId 转换为完整的菜品对象（包含 name、image），找不到的菜品跳过
    const popularDishes = sorted
      .map(([dishId]) => dishes.find(d => d.id === dishId))
      .filter(Boolean);

    this.setMenuImageData({ popularDishes });
  },

  // 搜索输入
  onSearchInput(e) {
    const searchKey = e.detail.value;
    this.setData({ searchKey });
    this.filterDishes();
  },

  // 清除搜索
  onSearchClear() {
    this.setData({ searchKey: '' });
    this.filterDishes();
  },

  // 切换分类
  onCategoryChange(e) {
    const categoryId = categoryIdValue(e.currentTarget.dataset.categoryid);
    if (categoryId === this.data.activeCategoryId || !this._panelIndexByCategory
      || !this._panelIndexByCategory.has(categoryId)) return;
    // On first visit mount this panel once; subsequent taps only change visibility.
    // No request, filtering, image resolution or cache queue in a category tap.
    this.setData({ activeCategoryId: categoryId, ...this.categoryVisitPatch(categoryId) });
  },

  // 计算高亮文本（返回片段数组）
  getHighlightSegments(dish) {
    if (!this.data.searchKey) {
      return [{ key: 'full', text: dish.name, highlight: false }];
    }
    const key = this.data.searchKey.toLowerCase();
    const name = dish.name;
    const lowerName = name.toLowerCase();
    const index = lowerName.indexOf(key);
    if (index === -1) {
      return [{ key: 'full', text: dish.name, highlight: false }];
    }
    const segments = [];
    if (index > 0) segments.push({ key: 'before', text: name.slice(0, index), highlight: false });
    segments.push({ key: 'match', text: name.slice(index, index + key.length), highlight: true });
    if (index + key.length < name.length) {
      segments.push({ key: 'after', text: name.slice(index + key.length), highlight: false });
    }
    return segments;
  },

  // Search only: update text/visibility in place; never replace dish/image nodes.
  filterDishes() {
    const key = this.data.searchKey.toLowerCase();
    const patch = {};
    const searchViews = new Map((this._allDishes || []).map(dish => [dish.id || dish._id, {
      searchHidden: Boolean(key && !dish.name.toLowerCase().includes(key)),
      nameSegments: this.getHighlightSegments(dish),
    }]));
    this.data.categoryPanels.forEach((panel, panelIndex) => {
      let count = 0;
      panel.dishes.forEach((dish, dishIndex) => {
        const view = searchViews.get(dish.id || dish._id);
        const prefix = `categoryPanels[${panelIndex}].dishes[${dishIndex}]`;
        if (!view.searchHidden) count += 1;
        if (dish.searchHidden !== view.searchHidden) patch[`${prefix}.searchHidden`] = view.searchHidden;
        if (JSON.stringify(dish.nameSegments) !== JSON.stringify(view.nameSegments)) patch[`${prefix}.nameSegments`] = view.nameSegments;
      });
      if (panel.visibleCount !== count) patch[`categoryPanels[${panelIndex}].visibleCount`] = count;
    });
    (this._allDishes || []).forEach(dish => Object.assign(dish, searchViews.get(dish.id || dish._id)));
    if (Object.keys(patch).length) this.setData(patch);
  },

  // 添加到购物车
  addToCart(e) {
    const requestedDish = e.currentTarget.dataset.dish || {};
    const dishId = requestedDish.id || requestedDish.dishId;
    const dish = this.data.dishes.find(item => item.id === dishId);
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return;
    }
    if (dish.type === 'drink') {
      if (hasDrinkOptions(dish)) {
        this.openDrinkOptions(dish);
      } else {
        this.addDrinkToCart(dish, {
          cupSize: '', sugarLevel: '', temperature: '', sweetener: '', toppings: [],
        }, 1);
      }
      return;
    }
    if (hasFoodOptions(dish)) {
      this.openFoodOptions(dish);
      return;
    }
    this.addFoodToCart(dish, { tastePreference: '', customRequests: [] }, 1);
  },

  openFoodOptions(dish, cartItem = null) {
    this.setData({
      foodOptionVisible: true,
      foodOptionDish: dish,
      foodOptionInitialOptions: cartItem ? cartItem.selectedOptions : null,
      foodOptionInitialQuantity: cartItem ? cartItem.quantity : 1,
      editingFoodCartItemId: cartItem ? cartItem.cartItemId : '',
    });
  },

  closeFoodOptions() {
    this.setData({
      foodOptionVisible: false,
      foodOptionDish: null,
      foodOptionInitialOptions: null,
      foodOptionInitialQuantity: 1,
      editingFoodCartItemId: '',
    });
  },

  addFoodToCart(dish, selectedOptions, quantity, editingCartItemId = '') {
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return false;
    }
    try {
      const cart = editingCartItemId
        ? cartService.replaceItem(
          editingCartItemId,
          dish,
          selectedOptions,
          quantity,
          { dishes: this.data.dishes },
        )
        : cartService.addDish(
          dish,
          selectedOptions,
          quantity,
          { dishes: this.data.dishes },
        );
      this.applyCart(cart);
      wx.showToast({ title: editingCartItemId ? '需求已更新' : '已加入点菜单', icon: 'success' });
      return true;
    } catch (error) {
      wx.showToast({ title: error.message || '加入点菜单失败', icon: 'none' });
      return false;
    }
  },

  onFoodOptionsConfirm(event) {
    const detail = event.detail || {};
    const dish = this.data.dishes.find(item => item.id === detail.dishId);
    if (!dish) {
      wx.showToast({ title: '菜品已下架，请刷新菜单', icon: 'none' });
      return;
    }
    const added = this.addFoodToCart(
      dish,
      detail.selectedOptions,
      detail.quantity,
      this.data.editingFoodCartItemId,
    );
    if (added) this.closeFoodOptions();
  },

  editFoodCartItem(event) {
    const cartItemId = event.currentTarget.dataset.cartitemid;
    const cartItem = this.data.cart.find(item => item.cartItemId === cartItemId);
    if (!cartItem || cartItem.type !== 'food') return;
    const dish = this.data.dishes.find(item => item.id === cartItem.dishId);
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return;
    }
    if (!hasFoodOptions(dish)) {
      wx.showToast({ title: '这道菜暂无可修改需求', icon: 'none' });
      return;
    }
    this.openFoodOptions(dish, cartItem);
  },

  openDrinkOptions(dish, cartItem = null) {
    this.setData({
      drinkOptionVisible: true,
      drinkOptionDish: dish,
      drinkOptionInitialOptions: cartItem ? cartItem.selectedOptions : null,
      drinkOptionInitialQuantity: cartItem ? cartItem.quantity : 1,
      editingCartItemId: cartItem ? cartItem.cartItemId : '',
    });
  },

  closeDrinkOptions() {
    this.setData({
      drinkOptionVisible: false,
      drinkOptionDish: null,
      drinkOptionInitialOptions: null,
      drinkOptionInitialQuantity: 1,
      editingCartItemId: '',
    });
  },

  addDrinkToCart(dish, selectedOptions, quantity, editingCartItemId = '') {
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return false;
    }
    try {
      const cart = editingCartItemId
        ? cartService.replaceItem(
          editingCartItemId,
          dish,
          selectedOptions,
          quantity,
          { dishes: this.data.dishes },
        )
        : cartService.addDish(
          dish,
          selectedOptions,
          quantity,
          { dishes: this.data.dishes },
        );
      this.applyCart(cart);
      wx.showToast({ title: editingCartItemId ? '规格已更新' : '已加入点菜单', icon: 'success' });
      return true;
    } catch (error) {
      wx.showToast({ title: error.message || '加入点菜单失败', icon: 'none' });
      return false;
    }
  },

  onDrinkOptionsConfirm(event) {
    const detail = event.detail || {};
    const dish = this.data.dishes.find(item => item.id === detail.dishId);
    if (!dish) {
      wx.showToast({ title: '饮品已下架，请刷新菜单', icon: 'none' });
      return;
    }
    const added = this.addDrinkToCart(
      dish,
      detail.selectedOptions,
      detail.quantity,
      this.data.editingCartItemId,
    );
    if (added) this.closeDrinkOptions();
  },

  editDrinkCartItem(event) {
    const cartItemId = event.currentTarget.dataset.cartitemid;
    const cartItem = this.data.cart.find(item => item.cartItemId === cartItemId);
    if (!cartItem || cartItem.type !== 'drink') return;
    const dish = this.data.dishes.find(item => item.id === cartItem.dishId);
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return;
    }
    if (!hasDrinkOptions(dish)) {
      wx.showToast({ title: '这杯饮品暂无可修改规格', icon: 'none' });
      return;
    }
    this.openDrinkOptions(dish, cartItem);
  },

  increaseCartItem(e) {
    const cartItemId = e.currentTarget.dataset.cartitemid;
    const item = this.data.cart.find(cartItem => cartItem.cartItemId === cartItemId);
    if (!item) return;
    const dish = this.data.dishes.find(currentDish => currentDish.id === item.dishId);
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return;
    }
    if (item.quantity >= 99) {
      wx.showToast({ title: '单项最多 99 份', icon: 'none' });
      return;
    }
    this.applyCart(cartService.updateQuantity(cartItemId, item.quantity + 1));
  },

  decreaseCartItem(e) {
    const cartItemId = e.currentTarget.dataset.cartitemid;
    const item = this.data.cart.find(cartItem => cartItem.cartItemId === cartItemId);
    if (!item) return;
    this.applyCart(cartService.updateQuantity(cartItemId, item.quantity - 1));
  },

  removeCartItem(e) {
    const cartItemId = e.currentTarget.dataset.cartitemid;
    this.applyCart(cartService.removeItem(cartItemId));
  },

  // 显示/隐藏购物车
  toggleCart() {
    this.setData({ showCart: !this.data.showCart });
    if (this.data.showCart) {
      this.cacheVisibleCovers();
    }
  },

  // 去结算
  goCheckout() {
    if (this.data.cart.length === 0) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' });
      return;
    }
    this.setData({ showCart: false });
    wx.navigateTo({ url: '/package-order/order-confirm/order-confirm' });
  },

  // 清空购物车
  clearCart() {
    wx.showModal({
      title: '清空点菜单',
      content: '确定清空当前点菜单吗？',
      confirmText: '清空',
      confirmColor: '#d45137',
      success: result => {
        if (!result.confirm) return;
        this.applyCart(cartService.clearCart());
        this.setData({ showCart: false });
      },
    });
  },

  // 跳转详情页（T7修复：menu.wxml的bindtap=goDetail原本死链接）
  goDetail(e) {
    const dishId = e.currentTarget.dataset.dishid;
    wx.navigateTo({ url: '/package-extra/detail/detail?dishid=' + dishId });
  },
});
