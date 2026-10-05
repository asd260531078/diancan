const app = getApp();
const catalogService = require('../../services/catalog');
const imageCache = require('../../services/imageCache');
const cartService = require('../../services/cart');
const orderService = require('../../services/orders');
const { formatMoney } = require('../../utils/money');
const {
  MAX_ORDER_NOTE_LENGTH,
  buildOrderDraft,
  createRequestId,
  validateCartAgainstDishes,
} = require('../utils/order-draft');

Page({
  ...imageCache.imageEventHandlers,
  data: {
    loading: true,
    submitting: false,
    cart: [],
    displayItems: [],
    itemCount: 0,
    displayTotalAmount: 0,
    displayTotalAmountText: '0',
    orderNote: '',
    orderNoteLength: 0,
    maxOrderNoteLength: MAX_ORDER_NOTE_LENGTH,
    itemIssues: [],
    validationMessage: '',
    canSubmit: false,
    requestId: '',
  },

  onLoad() {
    this.setData({ requestId: createRequestId(Date.now()) });
  },

  onUnload() {
    imageCache.releaseView(this);
  },

  onItemImageError(event) {
    imageCache.handleImageError(this, event.currentTarget.dataset.cover, undefined, event.currentTarget.dataset.src);
  },

  async onShow() {
    await this.loadConfirmation();
  },

  async loadConfirmation() {
    this.setData({ loading: true });
    try {
      const { items: dishes } = await catalogService.listDishes({ allowLocalFallback: false });
      this.latestDishes = dishes;
      const cart = cartService.loadCart({ dishes });
      this.applyCart(cart, dishes);
    } catch (error) {
      console.error('确认页加载失败', error);
      this.latestDishes = [];
      const cart = cartService.loadCart();
      this.applyCart(cart, []);
      wx.showToast({ title: error.message || '无法读取最新菜单', icon: 'none' });
    } finally {
      this.setData({ loading: false }, () => this.updateSubmitState());
    }
  },

  applyCart(cart, dishes = this.latestDishes || []) {
    const latestValidation = validateCartAgainstDishes(cart, dishes);
    const issueByCartItemId = latestValidation.issues.reduce((map, issue) => {
      map[issue.cartItemId] = issue.message;
      return map;
    }, {});
    const displayItems = cart.map(item => ({
      ...item,
      unitPriceText: item.unitPrice === null ? '' : formatMoney(item.unitPrice),
      subtotalText: item.unitPrice === null ? '' : formatMoney(item.unitPrice * item.quantity),
      issueText: issueByCartItemId[item.cartItemId] || '',
    }));
    const total = cartService.getTotalAmount(cart);
    imageCache.setImageData(this, {
      cart,
      displayItems,
      itemCount: cartService.getItemCount(cart),
      displayTotalAmount: total,
      displayTotalAmountText: formatMoney(total),
      itemIssues: latestValidation.issues,
    }, () => this.updateSubmitState());
  },

  updateSubmitState() {
    let validationMessage = '';
    try {
      buildOrderDraft({
        cart: this.data.cart,
        orderNote: this.data.orderNote,
        requestId: this.data.requestId,
        now: Date.now(),
      });
    } catch (error) {
      validationMessage = error.message;
    }
    if (!validationMessage && this.data.itemIssues.length > 0) {
      validationMessage = this.data.itemIssues[0].message;
    }
    const canSubmit = !this.data.loading
      && !this.data.submitting
      && this.data.itemIssues.length === 0
      && !validationMessage;
    this.setData({ validationMessage, canSubmit });
  },

  onOrderNoteInput(event) {
    const orderNote = String(event.detail.value || '').slice(0, MAX_ORDER_NOTE_LENGTH);
    this.setData({ orderNote, orderNoteLength: orderNote.length }, () => this.updateSubmitState());
  },

  increaseQuantity(event) {
    const cartItemId = event.currentTarget.dataset.cartitemid;
    const item = this.data.cart.find(current => current.cartItemId === cartItemId);
    if (!item) return;
    if (item.quantity >= 99) {
      wx.showToast({ title: '单项最多 99 份', icon: 'none' });
      return;
    }
    this.applyCart(cartService.updateQuantity(cartItemId, item.quantity + 1));
  },

  decreaseQuantity(event) {
    const cartItemId = event.currentTarget.dataset.cartitemid;
    const item = this.data.cart.find(current => current.cartItemId === cartItemId);
    if (!item) return;
    this.applyCart(cartService.updateQuantity(cartItemId, item.quantity - 1));
  },

  removeItem(event) {
    const cartItemId = event.currentTarget.dataset.cartitemid;
    this.applyCart(cartService.removeItem(cartItemId));
  },

  modifyItem(event) {
    app.globalData.pendingCartEdit = {
      cartItemId: event.currentTarget.dataset.cartitemid,
    };
    wx.navigateBack();
  },

  async onSubmitOrderDraft() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, canSubmit: false });
    try {
      const { items: dishes } = await catalogService.listDishes({ allowLocalFallback: false });
      this.latestDishes = dishes;
      const cart = cartService.loadCart({ dishes });
      const latestValidation = validateCartAgainstDishes(cart, dishes);
      this.applyCart(cart, dishes);
      if (!latestValidation.valid) throw new Error(latestValidation.issues[0].message);
      const draft = buildOrderDraft({
        cart,
        orderNote: this.data.orderNote,
        requestId: this.data.requestId,
        now: Date.now(),
      });
      this.lastOrderDraft = draft;
      console.log('ORDER DRAFT READY:', draft);
      const result = await orderService.createOrder(draft);
      const order = result.order;
      cartService.clearCart();
      this.lastOrderDraft = null;
      app.globalData.pendingCartEdit = null;
      this.setData({
        requestId: '',
        cart: [],
        displayItems: [],
        itemCount: 0,
        displayTotalAmount: 0,
        displayTotalAmountText: '0',
      });
      if (result.idempotent !== true) {
        orderService.notifyOrderCreated(order.id).catch(error => {
          console.warn('订单已创建，但管理员订阅消息发送失败', error);
        });
      }
      wx.showToast({ title: result.idempotent ? '订单已提交' : '点菜单已提交', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/package-order/order-detail/order-detail?id=${encodeURIComponent(order.id)}` });
      }, 500);
    } catch (error) {
      wx.showToast({ title: error.message || '点菜单提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false }, () => this.updateSubmitState());
    }
  },
});
