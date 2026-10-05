const { MAX_QUANTITY } = require('../../utils/cart');
const imageCache = require('../../services/imageCache');
const {
  getFoodLineAmount,
  getFoodSelectionView,
  initializeFoodSelection,
  selectTastePreference,
  toggleCustomRequest,
} = require('../../utils/food-selection');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    dish: { type: Object, value: null },
    initialSelectedOptions: { type: Object, value: null },
    initialQuantity: { type: Number, value: 1 },
    confirmText: { type: String, value: '加入点菜单' },
  },

  data: {
    tasteOptions: [],
    requestOptions: [],
    selectedOptions: { tastePreference: '', customRequests: [] },
    summaryText: '',
    missing: [],
    canConfirm: false,
    quantity: 1,
    lineAmount: null,
    hasPrice: false,
    maxQuantity: MAX_QUANTITY,
  },

  observers: {
    'visible,dish,initialSelectedOptions,initialQuantity': function resetWhenOpened(
      visible,
      dish,
      initialSelectedOptions,
      initialQuantity,
    ) {
      if (!visible || !dish || dish.type !== 'food') return;
      imageCache.setImageData(this, { cover: dish.cover || dish.image || '' });
      const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(initialQuantity) || 1)));
      const selectedOptions = initializeFoodSelection(dish, initialSelectedOptions || {});
      this.applySelection(selectedOptions, quantity);
    },
  },

  lifetimes: {
    detached() { imageCache.releaseView(this); },
  },

  methods: {
    ...imageCache.imageEventHandlers,
    noop() {},

    applySelection(selectedOptions, quantity = this.data.quantity) {
      const dish = this.properties.dish || {};
      const view = getFoodSelectionView(dish, selectedOptions);
      const lineAmount = getFoodLineAmount(dish.price, quantity);
      this.setData({ ...view, quantity, lineAmount, hasPrice: lineAmount !== null });
    },

    onTasteTap(event) {
      const selectedOptions = selectTastePreference(
        this.properties.dish || {},
        this.data.selectedOptions,
        event.currentTarget.dataset.value,
      );
      this.applySelection(selectedOptions);
    },

    onRequestTap(event) {
      const selectedOptions = toggleCustomRequest(
        this.properties.dish || {},
        this.data.selectedOptions,
        event.currentTarget.dataset.value,
      );
      this.applySelection(selectedOptions);
    },

    decreaseQuantity() {
      if (this.data.quantity <= 1) return;
      this.applySelection(this.data.selectedOptions, this.data.quantity - 1);
    },

    increaseQuantity() {
      if (this.data.quantity >= MAX_QUANTITY) {
        wx.showToast({ title: '单项最多 99 份', icon: 'none' });
        return;
      }
      this.applySelection(this.data.selectedOptions, this.data.quantity + 1);
    },

    close() {
      this.triggerEvent('close');
    },

    confirm() {
      if (!this.data.canConfirm) return;
      this.triggerEvent('confirm', {
        dishId: this.properties.dish && this.properties.dish.id,
        selectedOptions: this.data.selectedOptions,
        summaryText: this.data.summaryText,
        quantity: this.data.quantity,
      });
    },
  },
});
