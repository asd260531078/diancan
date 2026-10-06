const authService = require('../../services/auth');
const imageCache = require('../../services/imageCache');
const mealSetService = require('../services/meal-sets');
const { decorateMealSet } = require('../utils/meal-set');

Page({
  ...imageCache.imageEventHandlers,
  data: { loading: true, isAdmin: false, mealSets: [] },

  onUnload() { imageCache.releaseView(this); },

  async onShow() {
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const session = await authService.getSession(true, { maxAgeMs: 30000 });
      if (!session.isAdmin) {
        this.setData({ isAdmin: false, mealSets: [] });
        wx.showToast({ title: '当前账号不是管理员', icon: 'none' });
        return;
      }
      const result = await mealSetService.listManageMealSets();
      imageCache.setImageData(this, {
        isAdmin: true,
        mealSets: result.items.map(item => decorateMealSet(item, result.dishes, result.categories)),
      });
    } catch (error) {
      console.error('读取套餐管理列表失败', error);
      wx.showToast({ title: error.message || '套餐读取失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onAdd() {
    if (this.data.isAdmin) wx.navigateTo({ url: '/package-admin/meal-set-edit/meal-set-edit' });
  },

  onEdit(event) {
    if (!this.data.isAdmin) return;
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/package-admin/meal-set-edit/meal-set-edit?id=${encodeURIComponent(id)}` });
  },

  async onToggleEnabled(event) {
    if (!this.data.isAdmin) return;
    const id = event.currentTarget.dataset.id;
    const enabled = Boolean(event.detail.value);
    try {
      await mealSetService.updateMealSet(id, { enabled });
      await this.loadData();
      wx.showToast({ title: enabled ? '套餐已启用' : '套餐已停用', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '状态修改失败', icon: 'none' });
      await this.loadData();
    }
  },

  onDelete(event) {
    if (!this.data.isAdmin) return;
    const id = event.currentTarget.dataset.id;
    const mealSet = this.data.mealSets.find(item => item.id === id);
    if (!mealSet) return;
    wx.showModal({
      title: '删除套餐',
      content: `确定删除「${mealSet.name}」吗？不会删除其中的菜品。`,
      confirmText: '删除',
      confirmColor: '#c94f3d',
      success: async result => {
        if (!result.confirm) return;
        try {
          await mealSetService.deleteMealSet(id);
          await this.loadData();
          wx.showToast({ title: '套餐已删除', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      },
    });
  },
});
