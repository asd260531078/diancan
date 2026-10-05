const authService = require('../../services/auth');
const catalogService = require('../../services/catalog');
const imageService = require('../../services/image');
const imageCache = require('../../services/imageCache');
const mealSetService = require('../services/meal-sets');
const { MAX_MEAL_SET_ITEMS, MAX_MEAL_SET_QUANTITY } = require('../utils/meal-set');
const { DEFAULT_COVER } = require('../../utils/schema');

function emptyForm() {
  return {
    name: '', description: '', cover: '', tagsText: '', items: [],
    recommended: false, enabled: true, sort: 0,
  };
}

function chooseOneImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: result => resolve(result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath),
      fail: reject,
    });
  });
}

function moveItem(items, index, direction) {
  const next = [...items];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

Page({
  ...imageCache.imageEventHandlers,
  data: {
    loading: true,
    saving: false,
    uploading: false,
    isAdmin: false,
    editingId: '',
    form: emptyForm(),
    categories: [],
    selectorCategoryId: 'all',
    selectorVisible: false,
    filteredDishes: [],
    maxItems: MAX_MEAL_SET_ITEMS,
  },

  onLoad(options = {}) {
    this.editingId = String(options.id || '');
    this.initialize();
  },

  onUnload() { imageCache.releaseView(this); },

  async initialize() {
    this.setData({ loading: true });
    try {
      const session = await authService.getSession(true);
      if (!session.isAdmin) {
        wx.showToast({ title: '当前账号不是管理员', icon: 'none' });
        return;
      }
      const requests = [
        catalogService.listDishes({ includeDisabled: true, allowLocalFallback: false }),
        catalogService.listCategories({ includeDisabled: true, allowLocalFallback: false }),
      ];
      if (this.editingId) requests.push(mealSetService.getManageMealSet(this.editingId));
      const [dishResult, categoryResult, mealSetResult] = await Promise.all(requests);
      this.catalogDishes = dishResult.items;
      this.dishById = new Map(this.catalogDishes.map(dish => [dish.id, dish]));
      const categories = [{ id: 'all', name: '全部' }, ...categoryResult.items];
      let form = emptyForm();
      if (mealSetResult) {
        const item = mealSetResult.item;
        form = {
          name: item.name,
          description: item.description,
          cover: item.cover,
          tagsText: item.tags.join('，'),
          items: item.items.map(entry => this.decorateEditorItem(entry)),
          recommended: item.recommended,
          enabled: item.enabled,
          sort: item.sort,
        };
      }
      imageCache.setImageData(this, {
        isAdmin: true,
        editingId: this.editingId,
        categories,
        form,
      });
      this.filterDishes();
    } catch (error) {
      console.error('套餐编辑初始化失败', error);
      wx.showToast({ title: error.message || '套餐读取失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  decorateEditorItem(entry) {
    const dish = this.dishById && this.dishById.get(entry.dishId);
    return {
      dishId: entry.dishId,
      quantity: entry.quantity,
      missing: !dish,
      name: dish ? dish.name : '商品已失效',
      cover: dish ? (dish.cover || dish.image || DEFAULT_COVER) : DEFAULT_COVER,
      typeText: dish ? (dish.type === 'drink' ? '饮品' : '菜品') : `dishId：${entry.dishId}`,
    };
  },

  filterDishes() {
    const categoryId = this.data.selectorCategoryId;
    const selectedIds = new Set(this.data.form.items.map(item => item.dishId));
    const filteredDishes = (this.catalogDishes || [])
      .filter(dish => categoryId === 'all' || dish.categoryId === categoryId)
      .map(dish => ({
        ...dish,
        cover: dish.cover || dish.image || DEFAULT_COVER,
        alreadyAdded: selectedIds.has(dish.id),
      }));
    imageCache.setImageData(this, { filteredDishes });
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onSwitchChange(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: Boolean(event.detail.value) });
  },

  onOpenSelector() {
    this.setData({ selectorVisible: true });
    this.filterDishes();
  },

  onCloseSelector() {
    this.setData({ selectorVisible: false });
  },

  onCategoryFilter(event) {
    this.setData({ selectorCategoryId: event.currentTarget.dataset.id }, () => this.filterDishes());
  },

  onAddDish(event) {
    const dishId = event.currentTarget.dataset.id;
    const dish = this.dishById.get(dishId);
    if (!dish) return;
    const items = [...this.data.form.items];
    const existingIndex = items.findIndex(item => item.dishId === dishId);
    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: Math.min(MAX_MEAL_SET_QUANTITY, items[existingIndex].quantity + 1),
      };
      imageCache.setImageData(this, { 'form.items': items }, () => this.filterDishes());
      wx.showToast({ title: '已增加该商品数量', icon: 'none' });
      return;
    }
    if (items.length >= MAX_MEAL_SET_ITEMS) {
      wx.showToast({ title: `套餐最多 ${MAX_MEAL_SET_ITEMS} 种商品`, icon: 'none' });
      return;
    }
    items.push(this.decorateEditorItem({ dishId, quantity: 1 }));
    imageCache.setImageData(this, { 'form.items': items }, () => this.filterDishes());
  },

  onQuantity(event) {
    const index = Number(event.currentTarget.dataset.index);
    const delta = event.currentTarget.dataset.action === 'increase' ? 1 : -1;
    const items = [...this.data.form.items];
    if (!items[index]) return;
    items[index] = {
      ...items[index],
      quantity: Math.max(1, Math.min(MAX_MEAL_SET_QUANTITY, items[index].quantity + delta)),
    };
    imageCache.setImageData(this, { 'form.items': items });
  },

  onMoveItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    imageCache.setImageData(this, {
      'form.items': moveItem(this.data.form.items, index, event.currentTarget.dataset.direction),
    });
  },

  onRemoveItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const items = this.data.form.items.filter((item, itemIndex) => itemIndex !== index);
    imageCache.setImageData(this, { 'form.items': items }, () => this.filterDishes());
  },

  async onChooseCover() {
    if (this.data.uploading) return;
    let filePath = '';
    try {
      filePath = await chooseOneImage();
    } catch (error) {
      if (!String(error && error.errMsg || '').includes('cancel')) {
        wx.showToast({ title: '图片选择失败', icon: 'none' });
      }
      return;
    }
    if (!filePath) return;
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中' });
    try {
      const result = await imageService.uploadImage(filePath, 'meal-set-cover');
      imageCache.setImageData(this, { 'form.cover': result.fileID });
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  onRemoveCover() {
    imageCache.setImageData(this, { 'form.cover': '' });
  },

  async onSave() {
    if (this.data.saving) return;
    const form = this.data.form;
    const name = String(form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写套餐名称', icon: 'none' });
      return;
    }
    if (form.items.length === 0) {
      wx.showToast({ title: '请至少添加 1 个套餐商品', icon: 'none' });
      return;
    }
    if (form.items.some(item => item.missing)) {
      wx.showToast({ title: '请先删除已失效商品', icon: 'none' });
      return;
    }
    const tags = Array.from(new Set(
      String(form.tagsText || '').split(/[，,\n]/).map(item => item.trim()).filter(Boolean),
    ));
    const payload = {
      name,
      description: String(form.description || '').trim(),
      cover: form.cover || '',
      tags,
      items: form.items.map(item => ({ dishId: item.dishId, quantity: item.quantity })),
      recommended: form.recommended === true,
      enabled: form.enabled !== false,
      sort: Number(form.sort) || 0,
    };
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中' });
    try {
      if (this.editingId) await mealSetService.updateMealSet(this.editingId, payload);
      else await mealSetService.createMealSet(payload);
      wx.showToast({ title: '套餐已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      wx.showToast({ title: error.message || '套餐保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },
});
