// pages/menu/menu.js
const app = getApp();
const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const cartService = require('../../services/cart');
const orderService = require('../../services/orders');
const { dishStatusView, getDishRestriction } = require('../../utils/dish-status');
const { hasDrinkOptions, hasFoodOptions } = require('../../utils/cart');
const { formatMoney } = require('../../utils/money');
const { DEFAULT_COVER, listCover, safeDetailImage } = require('../../utils/detail-presentation');
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
// 长列表分批渲染：每个分类先渲染一屏多一点，滚到底部再追加，菜再多首屏也一样快。
const PANEL_PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 120;
const POPULAR_DISH_COUNT = 6;
const PLAIN_SEGMENTS_KEY = 'full';

function clearTimer(timer) {
  if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
}

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

function plainSegments(name) {
  return [{ key: PLAIN_SEGMENTS_KEY, text: name, highlight: false }];
}

function highlightSegments(name, key) {
  const text = String(name || '');
  const index = key ? text.toLowerCase().indexOf(key) : -1;
  if (index === -1) return plainSegments(text);
  const segments = [];
  if (index > 0) segments.push({ key: 'before', text: text.slice(0, index), highlight: false });
  segments.push({ key: 'match', text: text.slice(index, index + key.length), highlight: true });
  if (index + key.length < text.length) segments.push({ key: 'after', text: text.slice(index + key.length), highlight: false });
  return segments;
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
    // 这里只放原始来源，不检查本地缓存文件：真正显示的 src 由 setMenuImageData 在渲染时
    // 只为已渲染的卡片解析一次。之前每次初始化都会为全部菜品各做两次同步文件检查。
    displayCover: cachedCover === undefined
      ? safeDetailImage(listCover(dish), '菜单图片', dish.id) || DEFAULT_COVER
      : cachedCover,
    nameSegments: plainSegments(dish.name),
  };
}

function cardView(dish) {
  // Cards carry only small UI fields; option sheets and cart look up the full
  // dish by id. Recipes/steps/galleries never enter page data.
  const view = {};
  // 不带 image：它与 cover 相同，多一个字段渲染时就多一次图片绑定和缓存文件检查。
  ['id', '_id', 'name', 'cover', 'legacyCover', 'displayCover', 'description',
    'price', 'signature', 'recommended', 'spicyText', 'displayTags', 'canAddToCart',
    'restrictionText', 'restrictionKey', 'categoryId', 'nameSegments', 'eagerImage']
    .forEach(key => { if (dish[key] !== undefined) view[key] = dish[key]; });
  // 卡片显示小图（有匹配的缩略图时），详情页仍用主图。
  if (view.cover) view.cover = listCover(dish);
  // Normalize the UI projection only; raw dish/category fields stay unchanged.
  view.categoryId = categoryIdValue(dish.categoryId);
  return view;
}

function searchText(dish) {
  return [dish.name, ...(Array.isArray(dish.tags) ? dish.tags : [])].join(' ').toLowerCase();
}

function sameIds(left = [], right = []) {
  return left.length === right.length && left.every((item, index) => item.id === right[index].id);
}

Page({
  ...imageCache.imageEventHandlers,
  data: {
    viewMode: 'home',
    catalogLoading: true,
    catalogError: false,
    menuReady: false,
    dishCount: 0,
    featuredDishes: [],
    previewDishes: [],
    popularDishes: [], // 常点菜品（来自云端订单）
    categories: [{ id: ALL_CATEGORY_ID, name: '全部' }],
    activeCategoryId: ALL_CATEGORY_ID,
    categoryPanels: [],
    menuScrollAnchor: '',
    cart: [],
    cartCount: 0,
    totalAmount: 0,
    totalAmountText: '0',
    cartBump: false,
    showCart: false,
    searchKey: '',     // 输入框内容
    searchActive: false,
    searchResults: [],
    searchCount: 0,
    searchHasMore: false,
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
    this._dishes = [];
    this._dishById = new Map();
    this._panelCards = [];
    this._searchMatches = [];
    // 同一 Tab 的视图入口，不新增路由或更改分类数据。
    if (options.view === 'menu') this.setData({ viewMode: 'menu' });
    // 从 url 参数读取搜索词
    if (options.searchKey) {
      this.setData({ searchKey: decodeURIComponent(options.searchKey), viewMode: 'menu' });
    }
    const cached = catalogService.getCachedCatalog();
    if (cached.dishes.length) {
      this.applyCatalogView(cached.dishes, cached.categories, cached.version);
      this.setData({ catalogLoading: false });
    }
  },

  onUnload() {
    clearTimer(this._searchTimer);
    clearTimer(this._bumpTimer);
    imageCache.releaseView(this);
  },

  setMenuImageData(data, callback) {
    imageCache.setImageData(this, data, callback, { queue: false });
  },

  dishById(dishId) {
    return (this._dishById && this._dishById.get(dishId)) || null;
  },

  panelIndex(categoryId) {
    return this._panelIndexByCategory ? this._panelIndexByCategory.get(categoryId) : undefined;
  },

  // 当前可见的全部卡片（已渲染部分用页面数据，其余用内存里的卡片）。
  activeDishes() {
    if (this.data.searchActive || this.data.searchKey) {
      const key = String(this.data.searchKey || '').trim().toLowerCase();
      if (key && key !== this._searchKey) this.computeSearch(key);
      if (key) return this.data.searchResults.concat(this._searchMatches.slice(this.data.searchResults.length));
    }
    const index = this.panelIndex(this.data.activeCategoryId);
    if (index === undefined) return [];
    const rendered = this.data.categoryPanels[index].dishes;
    return rendered.concat(this._panelCards[index].slice(rendered.length));
  },

  // First visit mounts a panel with its first page; later taps only toggle visibility.
  categoryVisitPatch(categoryId) {
    const index = this.panelIndex(categoryId);
    if (index === undefined || this.data.categoryPanels[index].visited) return {};
    const cards = this._panelCards[index];
    return {
      [`categoryPanels[${index}].visited`]: true,
      [`categoryPanels[${index}].dishes`]: cards.slice(0, PANEL_PAGE_SIZE),
      [`categoryPanels[${index}].hasMore`]: cards.length > PANEL_PAGE_SIZE,
    };
  },

  // 带图片的数据走 imageCache 投影；纯显示切换直接 setData。
  applyVisitPatch(patch) {
    if (Object.keys(patch).some(key => key.endsWith('.dishes'))) this.setMenuImageData(patch);
    else this.setData(patch);
  },

  visibleCoverIDs() {
    const visible = this.data.viewMode === 'home'
      ? [...this.data.featuredDishes, ...this.data.popularDishes, ...this.data.previewDishes]
      : this.activeDishes().filter((dish, index) => index < EAGER_MENU_IMAGE_COUNT
        || (this._seenCoverIDs && this._seenCoverIDs.has(dish.cover || dish.image)));
    if (this.data.showCart) visible.push(...this.data.cart);
    return visible.map(dish => dish.cover || dish.image).filter(Boolean);
  },

  cacheVisibleCovers() {
    imageCache.queueCaches(this.visibleCoverIDs());
  },

  onDishImageLoad(event) {
    // 只有真正渲染出来并加载成功的图片才进入后台缓存队列。
    const { cover: source, src } = event.currentTarget.dataset;
    if (!source) return;
    // 显示的已经是本地缓存/默认图时无需再排队（排队前还要做一次同步文件检查）。
    if (src && src !== source) return;
    if (!this._seenCoverIDs) this._seenCoverIDs = new Set();
    if (this._seenCoverIDs.has(source)) return;
    this._seenCoverIDs.add(source);
    imageCache.queueCache(source);
  },

  switchView(e) {
    const viewMode = e.currentTarget.dataset.view === 'menu' ? 'menu' : 'home';
    if (viewMode === this.data.viewMode) return;
    this.applyVisitPatch({ viewMode, ...(viewMode === 'menu' ? this.categoryVisitPatch(this.data.activeCategoryId) : {}) });
    this.syncTabSelection();
    this.cacheVisibleCovers();
  },

  goAllMenu() {
    const hadSearch = Boolean(this.data.searchKey || this.data.searchActive);
    const index = this.panelIndex(ALL_CATEGORY_ID);
    this.applyVisitPatch({
      viewMode: 'menu', activeCategoryId: ALL_CATEGORY_ID,
      ...(index === undefined ? {} : { menuScrollAnchor: `menu-panel-${index}` }),
      ...this.categoryVisitPatch(ALL_CATEGORY_ID),
    });
    if (hadSearch) this.clearSearch();
    this.syncTabSelection();
    this.cacheVisibleCovers();
  },

  syncTabSelection() {
    if (typeof this.selectComponent !== 'function') return;
    const tabBar = this.selectComponent('#menu-tab-bar');
    if (tabBar) tabBar.syncSelected();
  },

  retryCatalog() {
    return this.loadCatalog({ force: true });
  },

  onDishImageError(e) {
    const dishId = e.currentTarget.dataset.dishid;
    const dish = this.dishById(dishId);
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
      this.applyVisitPatch({ viewMode: requestedView,
        ...(requestedView === 'menu' ? this.categoryVisitPatch(this.data.activeCategoryId) : {}) });
    }
    this.syncTabSelection();
    const revision = typeof catalogService.getCatalogRevision === 'function'
      ? catalogService.getCatalogRevision() : 0;
    if (this._catalogLoaded && this._lastCatalogRevision === revision) {
      this.refreshCart();
      this.calculatePopularDishes();
      this.resumePendingCartEdit();
      return;
    }
    // Ordinary re-entry keeps mounted panels and src. Only initial load, explicit
    // refresh or a catalog write revision fetches menu data again.
    // 购物车不依赖网络，有本地菜单时先显示出来（旧版购物车迁移需要菜单数据）。
    if (this._dishes.length) this.refreshCart();
    await this.loadCatalog();
    this.refreshCart();
    this.calculatePopularDishes();
    this.resumePendingCartEdit();
  },

  // 统一通过 catalog service 读取。云函数未部署时，service 会只读回退到本机旧数据。
  applyCatalogView(dishItems, categoryItems, version = '') {
    return this.initMenuState(categoryItems, dishItems, version);
  },

  // 判断云端目录与当前显示的是否相同：都有版本号时直接比版本，不必整份序列化比较。
  isSameCatalog(catalog) {
    const source = this._catalogSource;
    if (!source) return false;
    if (catalog.version && source.version) return catalog.version === source.version;
    if (!this._catalogSignature) return false;
    const signature = JSON.stringify([catalog.dishes, catalog.categories]);
    return signature === this._catalogSignature;
  },

  initMenuState(categoryItems, dishItems, version = '') {
    const categories = [{ id: ALL_CATEGORY_ID, name: '全部' }, ...categoryItems
      .filter(category => category.enabled !== false && categoryIdOf(category)
        && categoryIdOf(category) !== ALL_CATEGORY_ID)].map(category => ({
      ...category,
      id: categoryIdOf(category),
      displayIcon: getMenuCategoryIcon(category)
        || (/^(cloud:\/\/|https:\/\/|\/images\/)/.test(category.icon || '') ? category.icon : ''),
      displayIconText: categoryIconText(category.icon),
    }));
    // 未改动的菜品复用上次的卡片对象（以及已选定的图片 src）。
    const previousCards = this._dishViewCache || new Map();
    const previousSignatures = this._dishSourceSignatures || new Map();
    const signatures = new Map();
    const dishes = [];
    const cards = [];
    dishItems.forEach((dish, index) => {
      const id = dish.id || dish._id;
      const signature = JSON.stringify(dish);
      signatures.set(id, signature);
      const reusable = previousSignatures.get(id) === signature && previousCards.get(id);
      const decorated = { ...decorateDish(dish, reusable ? reusable.displayCover : undefined),
        eagerImage: index < EAGER_MENU_IMAGE_COUNT };
      dishes.push(decorated);
      cards.push(reusable && reusable.eagerImage === decorated.eagerImage ? reusable : cardView(decorated));
    });
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
    cards.forEach(card => {
      if (card.categoryId !== ALL_CATEGORY_ID && byCategory.has(card.categoryId)) byCategory.get(card.categoryId).push(card);
    });
    this._panelCards = categories.map(category => byCategory.get(category.id));
    const categoryPanels = categories.map((category, index) => {
      const items = this._panelCards[index];
      const isVisited = visited.has(category.id);
      return {
        categoryId: category.id,
        name: category.id === ALL_CATEGORY_ID ? '全部菜单' : category.name,
        visited: isVisited,
        total: items.length,
        // 只发送已访问分类的第一页；其他分类首次点开时再发。
        dishes: isVisited ? items.slice(0, PANEL_PAGE_SIZE) : [],
        hasMore: isVisited && items.length > PANEL_PAGE_SIZE,
      };
    });
    this._panelIndexByCategory = new Map(categoryPanels.map((panel, index) => [panel.categoryId, index]));
    this._catalogSource = { dishes: dishItems, categories: categoryItems, version: version || '' };
    // 有版本号时按版本比较，不再整份序列化；旧接口没有版本号才保留内容签名。
    this._catalogSignature = version ? '' : JSON.stringify([dishItems, categoryItems]);
    this._dishes = dishes;
    this._dishById = new Map(dishes.map(dish => [dish.id, dish]));
    this._cardById = new Map(cards.map(card => [card.id, card]));
    this._dishViewCache = this._cardById;
    this._dishSourceSignatures = signatures;
    this._searchKey = null;
    // Business data and the renderable default panel are committed atomically.
    // No download/resolve/init promise is awaited before menuReady becomes true.
    this.setMenuImageData({ categories, activeCategoryId, categoryPanels, menuReady: true, catalogError: false,
      dishCount: dishes.length,
      featuredDishes: cards.filter(card => card.signature || card.recommended).slice(0, 3),
      previewDishes: cards.slice(0, 4) });
    if (this.data.searchKey) this.applySearch();
    this.logMenuInit();
    this.calculatePopularDishes({ refresh: false });
    this.cacheVisibleCovers();
    return dishes;
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
      dishes: this.data.dishCount,
      panels: this.data.categoryPanels.length,
      activeCategoryId: this.data.activeCategoryId,
      visitedCategoryIds: this.data.categoryPanels.filter(panel => panel.visited).map(panel => panel.categoryId),
      defaultPanelDishes: defaultPanel ? defaultPanel.total : 0,
    });
  },

  async loadCatalog(options = {}) {
    if (this._catalogPromise) return this._catalogPromise;
    const hadDishes = this._dishes && this._dishes.length > 0;
    const revision = typeof catalogService.getCatalogRevision === 'function'
      ? catalogService.getCatalogRevision() : 0;
    if (!hadDishes) this.setData({ catalogLoading: true, catalogError: false });
    const request = (async () => {
      try {
        const catalog = await catalogService.loadCatalog({ force: Boolean(options.force) });
        const currentCategoryAvailable = this.data.activeCategoryId === ALL_CATEGORY_ID
          || catalog.categories.some(item => item.enabled !== false && categoryIdOf(item) === this.data.activeCategoryId);
        this._lastCatalogRevision = revision;
        this._catalogLoaded = true;
        if (hadDishes && currentCategoryAvailable && this.isSameCatalog(catalog)) {
          // 内容相同但版本号是新的（例如本地快照第一次拿到版本号）时记下来，下次直接比版本。
          if (catalog.version) this._catalogSource.version = catalog.version;
          if (this.data.catalogError) this.setData({ catalogError: false });
          return this._dishes;
        }
        return this.applyCatalogView(catalog.dishes, catalog.categories, catalog.version);
      } catch (error) {
        this.setData({ catalogError: true });
        console.error('加载菜单失败', error);
        wx.showToast({ title: error.message || '菜单加载失败', icon: 'none' });
        return this._dishes;
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

  refreshCart() {
    this.applyCart(cartService.loadCart({ dishes: this._dishes || [] }));
  },

  applyCart(cart) {
    if (cart === this._appliedCart) return;
    this._appliedCart = cart;
    const totalAmount = cartService.getTotalAmount(cart);
    this.setMenuImageData({
      cart,
      cartCount: cartService.getItemCount(cart),
      totalAmount,
      totalAmountText: formatMoney(totalAmount),
    });
  },

  // 加菜反馈：轻震 + 购物车角标弹一下，不弹出遮挡操作的 Toast。
  celebrateAdd() {
    try { if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' }); } catch (_) { /* 可选反馈 */ }
    clearTimer(this._bumpTimer);
    if (this.data.cartBump) this.setData({ cartBump: false });
    const bump = () => this.setData({ cartBump: true });
    if (typeof wx.nextTick === 'function') wx.nextTick(bump);
    else bump();
    if (typeof setTimeout === 'function') this._bumpTimer = setTimeout(() => this.setData({ cartBump: false }), 400);
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
    const dish = this.dishById(cartItem.dishId);
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

  // 常点菜品：先用上次统计结果立即显示，再在后台按云端订单更新。
  calculatePopularDishes(options = {}) {
    const apply = dishIds => {
      if (!this._cardById) return;
      const popularDishes = (dishIds || []).map(id => this._cardById.get(id)).filter(Boolean)
        .slice(0, POPULAR_DISH_COUNT);
      if (!sameIds(popularDishes, this.data.popularDishes)) this.setMenuImageData({ popularDishes });
    };
    apply(orderService.peekFrequentDishIds());
    if (options.refresh === false) return Promise.resolve();
    return orderService.getFrequentDishIds().then(apply).catch(() => {});
  },

  // 搜索输入：输入框立即更新，结果稍等输入停顿后再算，打字不卡。
  onSearchInput(e) {
    const searchKey = e.detail.value;
    this.setData({ searchKey });
    clearTimer(this._searchTimer);
    if (typeof setTimeout !== 'function') {
      this.applySearch();
      return;
    }
    this._searchTimer = setTimeout(() => this.applySearch(), SEARCH_DEBOUNCE_MS);
  },

  // 清除搜索
  onSearchClear() {
    clearTimer(this._searchTimer);
    this.setData({ searchKey: '' });
    this.clearSearch();
  },

  clearSearch() {
    this._searchKey = '';
    this._searchMatches = [];
    if (!this.data.searchActive && !this.data.searchResults.length) return;
    const index = this.panelIndex(this.data.activeCategoryId);
    this.setData({ searchActive: false, searchResults: [], searchCount: 0, searchHasMore: false,
      ...(index === undefined ? {} : { menuScrollAnchor: `menu-panel-${index}` }) });
  },

  computeSearch(key) {
    this._searchKey = key;
    // 在全部菜品里搜（名称和标签），菜多时不用先选对分类。
    this._searchMatches = (this._panelCards[this.panelIndex(ALL_CATEGORY_ID)] || [])
      .filter(card => searchText(this.dishById(card.id) || card).includes(key))
      .map(card => ({ ...card, nameSegments: highlightSegments(card.name, key) }));
    return this._searchMatches;
  },

  // 搜索结果单独一个列表，不改动已渲染的分类面板。
  applySearch() {
    const key = String(this.data.searchKey || '').trim().toLowerCase();
    if (!key) {
      this.clearSearch();
      return;
    }
    const matches = this.computeSearch(key);
    this.setMenuImageData({
      searchActive: true,
      searchCount: matches.length,
      searchResults: matches.slice(0, SEARCH_PAGE_SIZE),
      searchHasMore: matches.length > SEARCH_PAGE_SIZE,
      menuScrollAnchor: 'menu-search-top',
    });
  },

  // 滚动到底部：给当前列表追加下一页（只发送新增的卡片）。
  onMenuReachBottom() {
    if (this.data.searchActive) {
      const start = this.data.searchResults.length;
      if (start >= this._searchMatches.length) return;
      const patch = {};
      this._searchMatches.slice(start, start + SEARCH_PAGE_SIZE).forEach((card, offset) => {
        patch[`searchResults[${start + offset}]`] = card;
      });
      patch.searchHasMore = start + SEARCH_PAGE_SIZE < this._searchMatches.length;
      this.setMenuImageData(patch);
      return;
    }
    const index = this.panelIndex(this.data.activeCategoryId);
    if (index === undefined) return;
    const panel = this.data.categoryPanels[index];
    const cards = this._panelCards[index];
    const start = panel.dishes.length;
    if (!panel.visited || start >= cards.length) return;
    const patch = {};
    cards.slice(start, start + PANEL_PAGE_SIZE).forEach((card, offset) => {
      patch[`categoryPanels[${index}].dishes[${start + offset}]`] = card;
    });
    patch[`categoryPanels[${index}].hasMore`] = start + PANEL_PAGE_SIZE < cards.length;
    this.setMenuImageData(patch);
  },

  // 切换分类
  onCategoryChange(e) {
    const categoryId = categoryIdValue(e.currentTarget.dataset.categoryid);
    const index = this.panelIndex(categoryId);
    if ((categoryId === this.data.activeCategoryId && !this.data.searchActive) || index === undefined) return;
    // On first visit mount this panel once; subsequent taps only change visibility.
    // No request, filtering or image download in a category tap.
    this.applyVisitPatch({ activeCategoryId: categoryId, menuScrollAnchor: `menu-panel-${index}`,
      ...this.categoryVisitPatch(categoryId) });
    // 点分类表示想按分类浏览，顺手退出搜索。
    if (this.data.searchKey || this.data.searchActive) {
      clearTimer(this._searchTimer);
      this.setData({ searchKey: '' });
      this.clearSearch();
    }
  },

  // 添加到购物车
  addToCart(e) {
    const dataset = e.currentTarget.dataset || {};
    const dishId = dataset.dishid || (dataset.dish && (dataset.dish.id || dataset.dish.dishId));
    const dish = this.dishById(dishId);
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

  // 食物和饮品共用：编辑时替换原行，新增时合并相同规格。
  putDishInCart(dish, selectedOptions, quantity, editingCartItemId, updatedText) {
    const restriction = dish
      ? getDishRestriction(dish)
      : getDishRestriction({ enabled: false });
    if (restriction) {
      wx.showToast({ title: restriction.message, icon: 'none' });
      return false;
    }
    try {
      const cart = editingCartItemId
        ? cartService.replaceItem(editingCartItemId, dish, selectedOptions, quantity, { dishes: this._dishes })
        : cartService.addDish(dish, selectedOptions, quantity, { dishes: this._dishes });
      this.applyCart(cart);
      if (editingCartItemId) wx.showToast({ title: updatedText, icon: 'success' });
      else this.celebrateAdd();
      return true;
    } catch (error) {
      wx.showToast({ title: error.message || '加入点菜单失败', icon: 'none' });
      return false;
    }
  },

  addFoodToCart(dish, selectedOptions, quantity, editingCartItemId = '') {
    return this.putDishInCart(dish, selectedOptions, quantity, editingCartItemId, '需求已更新');
  },

  onFoodOptionsConfirm(event) {
    const detail = event.detail || {};
    const dish = this.dishById(detail.dishId);
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
    const dish = this.dishById(cartItem.dishId);
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
    return this.putDishInCart(dish, selectedOptions, quantity, editingCartItemId, '规格已更新');
  },

  onDrinkOptionsConfirm(event) {
    const detail = event.detail || {};
    const dish = this.dishById(detail.dishId);
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
    const dish = this.dishById(cartItem.dishId);
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
    const dish = this.dishById(item.dishId);
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

  // 跳转详情页
  goDetail(e) {
    const dishId = e.currentTarget.dataset.dishid;
    wx.navigateTo({ url: '/package-extra/detail/detail?dishid=' + encodeURIComponent(dishId) });
  },
});
