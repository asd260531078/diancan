const app = getApp();
const authService = require('../../services/auth');
const catalogService = require('../../services/catalog');
const imageService = require('../../services/image');
const imageCache = require('../../services/imageCache');

function imageIcon(value) {
  const icon = String(value || '').trim();
  return /^(cloud:\/\/|https:\/\/|\/images\/)/.test(icon) ? icon : '';
}

const TYPE_OPTIONS = [
  { value: 'food', label: '菜品' },
  { value: 'drink', label: '饮品' },
  { value: 'all', label: '菜品和饮品' },
];

function emptyForm(sort = 10) {
  return { name: '', type: 'food', icon: '', sort, enabled: true };
}

Page({
  ...imageCache.imageEventHandlers,
  data: {
    loading: true,
    saving: false,
    uploadingIcon: false,
    reordering: false,
    isAdmin: false,
    categories: [],
    showEditor: false,
    editingId: '',
    form: emptyForm(),
    formIconImage: '',
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
  },

  async onLoad() {
    await this.initialize();
  },

  onUnload() { imageCache.releaseView(this); },

  async initialize() {
    this.setData({ loading: true });
    try {
      const session = await authService.getSession(true);
      app.globalData.openid = session.openid;
      app.globalData.isAdmin = session.isAdmin;
      if (!session.isAdmin) {
        this.setData({ loading: false, isAdmin: false });
        wx.showModal({
          title: '无权访问',
          content: '当前微信账号不是管理员。',
          showCancel: false,
          success: () => wx.navigateBack(),
        });
        return;
      }
      this.setData({ isAdmin: true });
      await this.loadCategories();
    } catch (error) {
      console.error('分类管理初始化失败', error);
      this.setData({ loading: false });
      wx.showModal({ title: '加载失败', content: error.message || '无法读取分类', showCancel: false });
    }
  },

  async loadCategories() {
    const result = await catalogService.listCategories({
      includeDisabled: true,
      allowLocalFallback: false,
    });
    imageCache.setImageData(this, { categories: result.items.map(category => ({ ...category, iconImage: imageIcon(category.icon) })), loading: false });
  },

  nextSort() {
    const values = this.data.categories.map(item => Number(item.sort)).filter(Number.isFinite);
    return values.length ? Math.max(...values) + 10 : 10;
  },

  onAdd() {
    this.setData({
      showEditor: true,
      editingId: '',
      form: emptyForm(this.nextSort()),
      formIconImage: '',
      typeIndex: 0,
    });
  },

  onEdit(event) {
    const category = this.data.categories.find(item => item.id === event.currentTarget.dataset.id);
    if (!category) return;
    const typeIndex = Math.max(0, TYPE_OPTIONS.findIndex(item => item.value === category.type));
    imageCache.setImageData(this, {
      showEditor: true,
      editingId: category.id,
      typeIndex,
      formIconImage: imageIcon(category.icon),
      form: {
        name: category.name || '',
        type: category.type || 'all',
        icon: category.icon || '',
        sort: Number.isFinite(Number(category.sort)) ? Number(category.sort) : 0,
        enabled: category.enabled !== false,
      },
    });
  },

  onCancelEdit() {
    if (this.data.saving) return;
    this.setData({ showEditor: false, editingId: '', form: emptyForm(this.nextSort()), formIconImage: '' });
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    imageCache.setImageData(this, field === 'icon'
      ? { 'form.icon': value, formIconImage: imageIcon(value) }
      : { [`form.${field}`]: value });
  },

  async onUploadIcon() {
    if (!this.data.isAdmin || this.data.saving || this.data.uploadingIcon) return;
    let selected;
    try {
      selected = await new Promise((resolve, reject) => wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: reject,
      }));
    } catch (error) {
      if (!/cancel/i.test(error && error.errMsg || '')) wx.showToast({ title: '选择图片失败', icon: 'none' });
      return;
    }
    const filePath = selected && selected.tempFiles && selected.tempFiles[0] && selected.tempFiles[0].tempFilePath;
    if (!filePath) return;
    let failure = null;
    let loadingShown = false;
    this.setData({ uploadingIcon: true });
    try {
      wx.showLoading({ title: '上传分类图片中' });
      loadingShown = true;
      // 复用现有管理员上传用途；原始 PNG 保留透明通道。
      const uploaded = await imageService.uploadImage(filePath, 'dish-gallery');
      if (!imageService.isCloudFileID(uploaded.fileID)) throw new Error('未取得云存储 fileID');
      imageCache.setImageData(this, { 'form.icon': uploaded.fileID, formIconImage: uploaded.fileID });
    } catch (error) {
      failure = error;
    } finally {
      if (loadingShown) wx.hideLoading();
      this.setData({ uploadingIcon: false });
    }
    wx.showToast({ title: failure ? (failure.message || '上传失败') : '上传成功', icon: 'none' });
  },

  onClearIcon() {
    if (this.data.uploadingIcon || this.data.saving) return;
    this.setData({ 'form.icon': '', formIconImage: '' });
  },

  onCategoryIconError(event) {
    const data = event.currentTarget.dataset;
    imageCache.handleImageError(this, data.cover, '', data.src);
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value);
    const option = TYPE_OPTIONS[typeIndex];
    if (!option) return;
    this.setData({ typeIndex, 'form.type': option.value });
  },

  onEnabledChange(event) {
    this.setData({ 'form.enabled': Boolean(event.detail.value) });
  },

  async onSave() {
    if (!this.data.isAdmin || this.data.saving || this.data.uploadingIcon) return;
    const name = String(this.data.form.name || '').trim();
    const sort = Number(this.data.form.sort);
    if (!name) {
      wx.showToast({ title: '请填写分类名称', icon: 'none' });
      return;
    }
    if (!['food', 'drink', 'all'].includes(this.data.form.type)) {
      wx.showToast({ title: '请选择分类类型', icon: 'none' });
      return;
    }
    if (!Number.isFinite(sort)) {
      wx.showToast({ title: '排序值必须是数字', icon: 'none' });
      return;
    }
    const payload = {
      name,
      type: this.data.form.type,
      icon: String(this.data.form.icon || '').trim(),
      sort,
      enabled: this.data.form.enabled !== false,
    };
    this.setData({ saving: true });
    try {
      if (this.data.editingId) await catalogService.updateCategory(this.data.editingId, payload);
      else await catalogService.createCategory(payload);
      await this.loadCategories();
      this.setData({ showEditor: false, editingId: '' });
      wx.showToast({ title: '分类已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onToggleEnabled(event) {
    if (!this.data.isAdmin) return;
    const categoryId = event.currentTarget.dataset.id;
    const enabled = Boolean(event.detail.value);
    try {
      await catalogService.updateCategory(categoryId, { enabled });
      await this.loadCategories();
      wx.showToast({ title: enabled ? '分类已启用' : '分类已停用', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '状态修改失败', icon: 'none' });
      await this.loadCategories();
    }
  },

  async onMove(event) {
    if (!this.data.isAdmin || this.data.reordering) return;
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (!Number.isInteger(index) || target < 0 || target >= this.data.categories.length) return;
    const categories = [...this.data.categories];
    [categories[index], categories[target]] = [categories[target], categories[index]];
    imageCache.setImageData(this, { categories, reordering: true });
    try {
      await catalogService.reorderCategories(categories.map(item => item.id));
      await this.loadCategories();
      wx.showToast({ title: '顺序已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '排序失败', icon: 'none' });
      await this.loadCategories();
    } finally {
      this.setData({ reordering: false });
    }
  },

  onDelete(event) {
    if (!this.data.isAdmin) return;
    const categoryId = event.currentTarget.dataset.id;
    const category = this.data.categories.find(item => item.id === categoryId);
    if (!category) return;
    wx.showModal({
      title: '删除分类',
      content: `确定删除分类「${category.name}」吗？有菜品使用时服务端会拒绝删除。`,
      confirmText: '删除',
      confirmColor: '#c84d3d',
      success: async result => {
        if (!result.confirm) return;
        try {
          await catalogService.deleteCategory(categoryId);
          await this.loadCategories();
          wx.showToast({ title: '分类已删除', icon: 'success' });
        } catch (error) {
          wx.showModal({ title: '无法删除', content: error.message || '删除失败', showCancel: false });
        }
      },
    });
  },
});
