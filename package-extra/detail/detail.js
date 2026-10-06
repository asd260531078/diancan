// package-extra/detail/detail.js
const authService = require('../../services/auth');
const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const cartService = require('../../services/cart');
const { dishStatusView, getDishRestriction } = require('../../utils/dish-status');
const { hasDrinkOptions, hasFoodOptions } = require('../../utils/cart');
const {
  DEFAULT_COVER,
  SPICY_LABEL,
  SPICY_TEXT,
  buildDrinkSpecRows,
  decorateDetailDish,
} = require('../../utils/detail-presentation');

Page({
  ...imageCache.imageEventHandlers,
  data: {
    detailMode: false,
    detailLoading: false,
    detailNotFound: false,
    detailCanOrder: false,
    detailHasPrice: false,
    detailIsAdminPreview: false,
    recipeLoading: false,
    recipeError: false,
    fromCart: false,
    singleDish: null,
    drinkSpecRows: [],
    detailSpicyText: '',
    detailSpicyLabel: '',
    dishes: [],
    totalPrice: 0,
    note: '',
    address: '',
    isOrderView: false,
    drinkOptionVisible: false,
    foodOptionVisible: false,
  },

  onLoad(options) {
    if (options.from === 'cart') {
      this.setData({ fromCart: true });
      this.loadCartData();
    } else if (options.dishid) {
      this.setData({ detailMode: true, detailLoading: true, fromCart: false });
      this.loadSingleDish(decodeURIComponent(options.dishid));
    } else if (options.orderid) {
      this.setData({ fromCart: true });
      this.loadOrderData(options.orderid);
    }
  },

  onUnload() {
    imageCache.releaseView(this);
  },

  async loadCartData() {
    const { items: dishes } = await catalogService.listDishes();
    const cart = cartService.loadCart({ dishes });
    const dishById = new Map(dishes.map(dish => [dish.id, dish]));
    const cartItems = cart.map(item => {
      const dish = dishById.get(item.dishId);
      return {
        ...item,
        price: item.unitPrice,
        num: item.quantity,
        image: dish ? dish.cover : (item.cover || ''),
        description: dish ? dish.description : (item.description || ''),
      };
    });

    const totalPrice = cartService.getTotalAmount(cart);
    imageCache.setImageData(this, { dishes: cartItems, totalPrice });
  },

  // 先用菜单里已有的摘要立即出画面，再在后台补齐做法/食材。
  async loadSingleDish(dishId) {
    const summary = catalogService.peekDish(dishId);
    if (summary) this.renderDish(summary, { recipeLoading: true });
    try {
      let { item: dish } = await catalogService.getDishDetail(dishId);
      let detailIsAdminPreview = false;
      if (!dish) {
        try {
          const session = await authService.getSession(true);
          if (session.isAdmin) {
            const adminResult = await catalogService.getDishDetail(dishId, { includeDisabled: true });
            dish = adminResult.item;
            detailIsAdminPreview = Boolean(dish);
          }
        } catch (sessionError) {
          console.error('检查管理员预览权限失败', sessionError);
        }
      }
      if (!dish) {
        this.setData({ detailLoading: false, detailNotFound: true, singleDish: null, recipeLoading: false });
        wx.showModal({
          title: '无法查看',
          content: '该菜品已下架',
          showCancel: false,
          success: () => this.goBackToMenu(),
        });
        return;
      }
      this.renderDish(dish, { detailIsAdminPreview });
    } catch (error) {
      console.error('加载菜品详情失败', error);
      if (summary) {
        // 网络不好时保留已显示的信息，只提示做法没加载出来。
        this.setData({ recipeLoading: false, recipeError: true });
        return;
      }
      this.setData({ detailLoading: false, detailNotFound: true });
      wx.showToast({ title: error.message || '详情加载失败', icon: 'none' });
    }
  },

  renderDish(dish, options = {}) {
    const detailIsAdminPreview = Boolean(options.detailIsAdminPreview);
    const safeDish = decorateDetailDish(dish);
    const status = dishStatusView(safeDish);
    const detailDish = { ...safeDish, ...status };
    if (!this.data.singleDish || this.data.singleDish.name !== dish.name) {
      wx.setNavigationBarTitle({ title: dish.name || '菜品详情' });
    }
    imageCache.setImageData(this, {
      detailLoading: false,
      detailNotFound: false,
      recipeLoading: Boolean(options.recipeLoading),
      recipeError: false,
      detailCanOrder: detailIsAdminPreview ? false : status.canOrder,
      detailHasPrice: dish.price !== null && dish.price !== undefined && dish.price !== '',
      detailIsAdminPreview,
      singleDish: detailDish,
      drinkSpecRows: buildDrinkSpecRows(detailDish),
      detailSpicyText: SPICY_TEXT[dish.spicyLevel] || '',
      detailSpicyLabel: SPICY_LABEL[dish.spicyLevel] || '',
      totalPrice: dish.price === null || dish.price === undefined ? 0 : dish.price,
      dishes: [{ ...detailDish, num: 1, dishId: dish.id }],
    }, null, { details: true });
  },

  retryRecipe() {
    const dish = this.data.singleDish;
    if (!dish) return;
    this.setData({ recipeLoading: true, recipeError: false });
    this.loadSingleDish(dish.id);
  },

  goBackToMenu() {
    const pages = getCurrentPages();
    if (pages && pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/menu/menu' });
  },

  onCoverError(event) {
    if (!this.data.singleDish || this.data.singleDish.displayCover === DEFAULT_COVER) return;
    imageCache.handleImageError(this, this.data.singleDish.cover || this.data.singleDish.image, DEFAULT_COVER, event && event.currentTarget.dataset.src);
  },

  onStepImageError(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.data.singleDish || !Number.isInteger(index)) return;
    const steps = [...this.data.singleDish.steps];
    if (!steps[index] || !steps[index].image) return;
    imageCache.handleImageError(this, steps[index].image, '', event.currentTarget.dataset.src);
  },

  openFoodOptionsFromDetail() {
    const dish = this.data.singleDish;
    if (!dish || dish.type !== 'food' || !this.data.detailCanOrder) return;
    if (!hasFoodOptions(dish)) {
      this.addDetailFoodToCart(dish, { tastePreference: '', customRequests: [] }, 1);
      return;
    }
    this.setData({ foodOptionVisible: true });
  },

  closeFoodOptions() {
    this.setData({ foodOptionVisible: false });
  },

  addDetailFoodToCart(dish, selectedOptions, quantity) {
    this.addDetailDishToCart(dish, selectedOptions, quantity, 'foodOptionVisible');
  },

  // 用详情页刚拉到的最新数据（或菜单内存里的更新状态）判断能否点，不再整单重拉菜单。
  // 下单时云端还会再校验一次售罄/下架。
  addDetailDishToCart(dish, selectedOptions, quantity, sheetKey) {
    try {
      const currentDish = catalogService.peekDish(dish.id) || dish;
      const restriction = currentDish
        ? getDishRestriction(currentDish)
        : getDishRestriction({ enabled: false });
      if (restriction) {
        wx.showToast({ title: restriction.message, icon: 'none' });
        return;
      }
      const cart = cartService.addDish(currentDish, selectedOptions, quantity);
      this.setData({ [sheetKey]: false });
      try { if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light' }); } catch (_) { /* 可选反馈 */ }
      wx.showToast({
        title: `已加入点菜单（共 ${cartService.getItemCount(cart)} 份）`,
        icon: 'success',
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加入点菜单失败', icon: 'none' });
    }
  },

  onFoodOptionsConfirm(event) {
    const detail = event.detail || {};
    const dish = this.data.singleDish;
    if (!dish || dish.id !== detail.dishId || !this.data.detailCanOrder) {
      wx.showToast({ title: '当前菜品暂时不能加入点菜单', icon: 'none' });
      return;
    }
    this.addDetailFoodToCart(dish, detail.selectedOptions, detail.quantity);
  },

  openDrinkOptionsFromDetail() {
    const dish = this.data.singleDish;
    if (!dish || dish.type !== 'drink' || !this.data.detailCanOrder) return;
    if (!hasDrinkOptions(dish)) {
      this.addDetailDrinkToCart(dish, {
        cupSize: '', sugarLevel: '', temperature: '', sweetener: '', toppings: [],
      }, 1);
      return;
    }
    this.setData({ drinkOptionVisible: true });
  },

  closeDrinkOptions() {
    this.setData({ drinkOptionVisible: false });
  },

  addDetailDrinkToCart(dish, selectedOptions, quantity) {
    this.addDetailDishToCart(dish, selectedOptions, quantity, 'drinkOptionVisible');
  },

  onDrinkOptionsConfirm(event) {
    const detail = event.detail || {};
    const dish = this.data.singleDish;
    if (!dish || dish.id !== detail.dishId || !this.data.detailCanOrder) {
      wx.showToast({ title: '当前饮品暂时不能加入点菜单', icon: 'none' });
      return;
    }
    this.addDetailDrinkToCart(dish, detail.selectedOptions, detail.quantity);
  },

  // 加载历史订单数据（用于再来一单）
  async loadOrderData(orderId) {
    const orders = wx.getStorageSync('orders') || [];
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const { items: dishes } = await catalogService.listDishes();
    const dishById = new Map(dishes.map(dish => [dish.id, dish]));
    const cartItems = order.items.map(item => {
      const dish = dishById.get(item.dishId);
      return { 
        ...item, 
        image: dish ? dish.cover : (item.cover || ''),
        description: dish ? dish.description : '' 
      };
    });

    const totalPrice = order.items.reduce((sum, item) => sum + item.price * item.num, 0);
    imageCache.setImageData(this, {
      dishes: cartItems, 
      totalPrice,
      note: order.note || '',
      address: order.address || '',
      isOrderView: true,
    });
  },

  // 再来一单（从详情页操作）
  reorder() {
    wx.showToast({ title: '本机旧订单仅供查看', icon: 'none' });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value });
  },

  // 选择微信收货地址
  chooseAddress() {
    wx.chooseAddress({
      success: (res) => {
        const fullAddress = res.provinceName + res.cityName + res.countyName + res.detailInfo;
        this.setData({ address: fullAddress });
      },
      fail: (err) => {
        wx.showToast({ title: '已取消，可手动输入', icon: 'none', duration: 2000 });
      }
    });
  },

  // 提交订单
  submitOrder() {
    wx.showToast({ title: '正式提交订单将在 3D 开放', icon: 'none' });
  },
});
