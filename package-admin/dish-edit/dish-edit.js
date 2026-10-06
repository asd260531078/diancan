const app = getApp();
const authService = require('../../services/auth');
const catalogService = require('../../services/catalog');
const imageService = require('../../services/image');
const imageCache = require('../../services/imageCache');
const {
  ALL_TOPPINGS,
  CUP_SIZE_OPTIONS,
  SUGAR_LEVELS,
  SWEETENER_TYPES,
  TEMPERATURE_OPTIONS,
  TOPPING_GROUPS,
} = require('../../config/drink-options');
const {
  CUSTOM_REQUEST_OPTIONS,
  TASTE_PREFERENCES,
} = require('../../config/food-options');
const {
  MEAL_ROLE_OPTIONS,
  mealRoleOptionViews,
  normalizeMealRoles,
} = require('../../config/meal-roles');

const TYPE_OPTIONS = [
  { value: 'food', label: '菜品' },
  { value: 'drink', label: '饮品' },
];

const SPICY_OPTIONS = [
  { value: 'none', label: '不辣' },
  { value: 'mild', label: '微辣' },
  { value: 'medium', label: '中辣' },
  { value: 'hot', label: '重辣' },
];

function optionViews(options, selected) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  return options.map(name => ({ name, checked: selectedValues.includes(name) }));
}

function toppingGroupViews(selected, currentGroups) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  return TOPPING_GROUPS.map((group, index) => {
    const current = Array.isArray(currentGroups) ? currentGroups.find(item => item.key === group.key) : null;
    return {
      key: group.key,
      name: group.name,
      expanded: current ? current.expanded : index === 0,
      selectedCount: group.options.filter(name => selectedValues.includes(name)).length,
      options: optionViews(group.options, selectedValues),
    };
  });
}

function customToppingValues(selected) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  return selectedValues.filter(name => !ALL_TOPPINGS.includes(name));
}

function customCupSizeValues(selected) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  return selectedValues.filter(name => !CUP_SIZE_OPTIONS.includes(name));
}

function customFoodRequestValues(selected) {
  const selectedValues = Array.isArray(selected) ? selected : [];
  return selectedValues.filter(name => !CUSTOM_REQUEST_OPTIONS.includes(name));
}

function createEditorItemId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resequenceSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((step, index) => ({
    ...step,
    stepNumber: index + 1,
  }));
}

function movedItem(items, index, direction) {
  const next = [...items];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (!Number.isInteger(index) || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function confirmRemoval(content) {
  return new Promise(resolve => {
    wx.showModal({
      title: '确认删除',
      content,
      confirmText: '删除',
      confirmColor: '#c84d3d',
      cancelText: '取消',
      success: result => resolve(result.confirm === true),
      fail: () => resolve(false),
    });
  });
}

function createEmptyForm(category) {
  const selected = category || {};
  const type = selected.type === 'drink' ? 'drink' : 'food';
  return {
    name: '',
    type,
    categoryId: selected.id || '',
    categoryName: selected.name || '',
    cover: '',
    coverThumb: '',
    coverThumbOf: '',
    legacyCover: '',
    images: [],
    legacyImagesCount: 0,
    description: '',
    tagsText: '',
    price: '',
    estimatedTime: '',
    servingSize: '',
    spicyLevel: 'none',
    ingredients: [],
    steps: [],
    tips: '',
    recommended: false,
    signature: false,
    availableToday: true,
    soldOut: false,
    enabled: true,
    sort: 0,
    availableCupSizes: [],
    availableSugarLevels: [],
    availableTemperatures: [],
    availableSweetenerTypes: [],
    availableToppings: [],
    availableTastePreferences: [],
    availableCustomRequests: [],
    mealRoles: type === 'drink' ? ['drink'] : [],
  };
}

function dishToForm(dish) {
  const cover = dish.cover || dish.image || '';
  const hasLegacyCover = cover && cover !== '/images/default-dish.png' && !imageService.isCloudFileID(cover);
  const sourceImages = Array.isArray(dish.images) ? dish.images : [];
  return {
    ...createEmptyForm(),
    name: dish.name || '',
    type: dish.type === 'drink' ? 'drink' : 'food',
    categoryId: dish.categoryId || '',
    categoryName: dish.categoryName || dish.category || '',
    cover: imageService.isCloudFileID(cover) ? cover : '',
    coverThumb: imageService.isCloudFileID(dish.coverThumb) ? dish.coverThumb : '',
    coverThumbOf: imageService.isCloudFileID(dish.coverThumb) ? dish.coverThumbOf || '' : '',
    legacyCover: hasLegacyCover ? cover : '',
    images: sourceImages.filter(imageService.isCloudFileID),
    legacyImagesCount: sourceImages.filter(item => !imageService.isCloudFileID(item)).length,
    description: dish.description || '',
    tagsText: Array.isArray(dish.tags) ? dish.tags.join('，') : '',
    price: dish.price === null || dish.price === undefined ? '' : dish.price,
    estimatedTime: dish.estimatedTime || '',
    servingSize: dish.servingSize || '',
    spicyLevel: dish.spicyLevel || 'none',
    ingredients: Array.isArray(dish.ingredients)
      ? dish.ingredients.map(item => ({ ...item }))
      : [],
    steps: resequenceSteps(Array.isArray(dish.steps)
      ? dish.steps.map(item => ({ ...item }))
      : []),
    tips: dish.tips || '',
    recommended: dish.recommended === true,
    signature: dish.signature === true,
    availableToday: dish.availableToday !== false,
    soldOut: dish.soldOut === true,
    enabled: dish.enabled !== false,
    sort: Number.isFinite(Number(dish.sort)) ? Number(dish.sort) : 0,
    availableCupSizes: Array.isArray(dish.availableCupSizes) ? dish.availableCupSizes : [],
    availableSugarLevels: Array.isArray(dish.availableSugarLevels) ? dish.availableSugarLevels : [],
    availableTemperatures: Array.isArray(dish.availableTemperatures)
      ? dish.availableTemperatures
      : (Array.isArray(dish.availableIceLevels) ? dish.availableIceLevels : []),
    availableSweetenerTypes: Array.isArray(dish.availableSweetenerTypes) ? dish.availableSweetenerTypes : [],
    availableToppings: Array.isArray(dish.availableToppings) ? dish.availableToppings : [],
    availableTastePreferences: Array.isArray(dish.availableTastePreferences)
      ? dish.availableTastePreferences
      : [],
    availableCustomRequests: Array.isArray(dish.availableCustomRequests)
      ? dish.availableCustomRequests
      : [],
    mealRoles: normalizeMealRoles(dish.mealRoles, dish.type),
  };
}

Page({
  ...imageCache.imageEventHandlers,
  data: {
    loading: true,
    saving: false,
    uploading: false,
    isAdmin: false,
    dishId: '',
    categories: [],
    availableCategories: [],
    typeOptions: TYPE_OPTIONS,
    spicyOptions: SPICY_OPTIONS,
    cupSizeOptions: optionViews(CUP_SIZE_OPTIONS, []),
    customCupSizes: [],
    customCupSizeInput: '',
    sugarOptions: optionViews(SUGAR_LEVELS, []),
    temperatureOptions: optionViews(TEMPERATURE_OPTIONS, []),
    sweetenerOptions: optionViews(SWEETENER_TYPES, []),
    toppingGroups: toppingGroupViews([], []),
    customToppings: [],
    customToppingInput: '',
    tastePreferenceOptions: optionViews(TASTE_PREFERENCES, []),
    customRequestOptions: optionViews(CUSTOM_REQUEST_OPTIONS, []),
    customFoodRequests: [],
    customFoodRequestInput: '',
    mealRoleOptions: mealRoleOptionViews([]),
    typeIndex: 0,
    spicyIndex: 0,
    form: createEmptyForm(),
  },

  async onLoad(options) {
    const dishId = options && options.id ? decodeURIComponent(options.id) : '';
    this.setData({ dishId });
    wx.setNavigationBarTitle({ title: dishId ? '编辑菜品' : '新增菜品' });
    await this.initialize();
  },

  onUnload() { imageCache.releaseView(this); },

  async initialize() {
    this.setData({ loading: true });
    try {
      const session = await authService.getSession(true, { maxAgeMs: 30000 });
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

      // 分类和菜品详情同时请求，进入编辑页少等一次往返。
      const detailRequest = this.data.dishId
        ? catalogService.getDishDetail(this.data.dishId, { includeDisabled: true, force: true })
        : null;
      if (detailRequest) detailRequest.catch(() => {});
      let categoryResult = await catalogService.listCategories({
        includeDisabled: true,
        allowLocalFallback: false,
      });
      if (!categoryResult.items.length) {
        await catalogService.seedDefaultCategories();
        categoryResult = await catalogService.listCategories({
          includeDisabled: true,
          allowLocalFallback: false,
        });
      }
      const categories = categoryResult.items;
      let form;
      if (this.data.dishId) {
        // 编辑必须拿完整数据（含食材/步骤/图集），列表接口只返回摘要，保存时会丢做法。
        const { item: dish } = await detailRequest;
        if (!dish) throw new Error('未找到需要编辑的菜品');
        form = dishToForm(dish);
      } else {
        form = createEmptyForm();
      }

      if (!categories.some(item => item.id === form.categoryId)) {
        const legacyCategory = categories.find(item => item.name === form.categoryName);
        if (legacyCategory) {
          form.categoryId = legacyCategory.id;
          form.categoryName = legacyCategory.name;
        }
      }

      const availableCategories = this.getAvailableCategories(categories, form.type);
      const categorySelection = this.resolveCategorySelection(availableCategories, form.categoryId);
      form.categoryId = categorySelection.categoryId;
      form.categoryName = categorySelection.categoryName;
      imageCache.setImageData(this, {
        isAdmin: true,
        loading: false,
        categories,
        availableCategories,
        form,
        typeIndex: Math.max(0, TYPE_OPTIONS.findIndex(item => item.value === form.type)),
        spicyIndex: Math.max(0, SPICY_OPTIONS.findIndex(item => item.value === form.spicyLevel)),
        ...this.getDrinkOptionViewData(form),
        ...this.getFoodOptionViewData(form),
        mealRoleOptions: mealRoleOptionViews(form.mealRoles),
      }, null, { details: true });
    } catch (error) {
      console.error('菜品编辑页初始化失败', error);
      this.setData({ loading: false });
      wx.showModal({
        title: '加载失败',
        content: error.message || '无法读取菜品数据',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
    }
  },

  getAvailableCategories(categories, type) {
    return categories
      .filter(category => {
        const categoryType = category.type || category.itemType || 'all';
        const typeMatched = categoryType === 'all' || categoryType === type;
        return typeMatched && category.enabled !== false;
      })
      .map(category => ({
        ...category,
        displayName: category.name,
      }));
  },

  resolveCategorySelection(availableCategories, currentCategoryId) {
    const current = availableCategories.find(item => item.id === currentCategoryId);
    const selected = current || (availableCategories.length === 1 ? availableCategories[0] : null);
    return {
      categoryId: selected ? selected.id : '',
      categoryName: selected ? selected.name : '',
    };
  },

  getDrinkOptionViewData(form, currentGroups = this.data.toppingGroups) {
    return {
      cupSizeOptions: optionViews(CUP_SIZE_OPTIONS, form.availableCupSizes),
      customCupSizes: customCupSizeValues(form.availableCupSizes),
      sugarOptions: optionViews(SUGAR_LEVELS, form.availableSugarLevels),
      temperatureOptions: optionViews(TEMPERATURE_OPTIONS, form.availableTemperatures),
      sweetenerOptions: optionViews(SWEETENER_TYPES, form.availableSweetenerTypes),
      toppingGroups: toppingGroupViews(form.availableToppings, currentGroups),
      customToppings: customToppingValues(form.availableToppings),
    };
  },

  getFoodOptionViewData(form) {
    return {
      tastePreferenceOptions: optionViews(TASTE_PREFERENCES, form.availableTastePreferences),
      customRequestOptions: optionViews(CUSTOM_REQUEST_OPTIONS, form.availableCustomRequests),
      customFoodRequests: customFoodRequestValues(form.availableCustomRequests),
    };
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onSwitchChange(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: Boolean(event.detail.value) });
  },

  onTypeChange(event) {
    const option = TYPE_OPTIONS[Number(event.detail.value)];
    if (!option) return;
    const availableCategories = this.getAvailableCategories(this.data.categories, option.value);
    const categorySelection = this.resolveCategorySelection(
      availableCategories,
      this.data.form.categoryId,
    );
    const switchingToFood = option.value === 'food';
    const nextForm = {
      ...this.data.form,
      type: option.value,
      categoryId: categorySelection.categoryId,
      categoryName: categorySelection.categoryName,
      spicyLevel: switchingToFood ? this.data.form.spicyLevel : 'none',
      availableCupSizes: switchingToFood ? [] : this.data.form.availableCupSizes,
      availableSugarLevels: switchingToFood ? [] : this.data.form.availableSugarLevels,
      availableTemperatures: switchingToFood ? [] : this.data.form.availableTemperatures,
      availableSweetenerTypes: switchingToFood ? [] : this.data.form.availableSweetenerTypes,
      availableToppings: switchingToFood ? [] : this.data.form.availableToppings,
      availableTastePreferences: switchingToFood ? this.data.form.availableTastePreferences : [],
      availableCustomRequests: switchingToFood ? this.data.form.availableCustomRequests : [],
      mealRoles: switchingToFood
        ? normalizeMealRoles(this.data.form.mealRoles, 'food')
        : ['drink'],
    };
    this.setData({
      typeIndex: Number(event.detail.value),
      availableCategories,
      form: nextForm,
      spicyIndex: switchingToFood ? this.data.spicyIndex : 0,
      ...this.getDrinkOptionViewData(nextForm),
      ...this.getFoodOptionViewData(nextForm),
      mealRoleOptions: mealRoleOptionViews(nextForm.mealRoles),
    });
  },

  onMealRolesChange(event) {
    if (this.data.form.type !== 'food') return;
    const mealRoles = normalizeMealRoles(event.detail.value, 'food');
    this.setData({
      'form.mealRoles': mealRoles,
      mealRoleOptions: mealRoleOptionViews(mealRoles),
    });
  },

  onCategoryChange(event) {
    const category = this.data.availableCategories[Number(event.detail.value)];
    if (!category) return;
    const categoryType = category.type || 'all';
    const changes = {
      'form.categoryId': category.id,
      'form.categoryName': category.name,
    };
    if (categoryType !== 'all' && categoryType !== this.data.form.type) return;
    this.setData(changes);
  },

  onSpicyChange(event) {
    const option = SPICY_OPTIONS[Number(event.detail.value)];
    if (!option) return;
    this.setData({
      spicyIndex: Number(event.detail.value),
      'form.spicyLevel': option.value,
    });
  },

  onDrinkOptionChange(event) {
    const field = event.currentTarget.dataset.field;
    if (!['availableCupSizes', 'availableSugarLevels', 'availableTemperatures', 'availableSweetenerTypes'].includes(field)) return;
    let values = Array.isArray(event.detail.value) ? event.detail.value : [];
    if (field === 'availableCupSizes') {
      values = [...values, ...customCupSizeValues(this.data.form.availableCupSizes)];
    }
    const nextForm = { ...this.data.form, [field]: values };
    this.setData({
      [`form.${field}`]: values,
      ...this.getDrinkOptionViewData(nextForm),
    });
  },

  onFoodOptionChange(event) {
    const field = event.currentTarget.dataset.field;
    if (!['availableTastePreferences', 'availableCustomRequests'].includes(field)) return;
    let values = Array.isArray(event.detail.value) ? event.detail.value : [];
    if (field === 'availableCustomRequests') {
      values = [...values, ...customFoodRequestValues(this.data.form.availableCustomRequests)];
    }
    const nextForm = { ...this.data.form, [field]: values };
    this.setData({
      [`form.${field}`]: values,
      ...this.getFoodOptionViewData(nextForm),
    });
  },

  onCustomFoodRequestInput(event) {
    this.setData({ customFoodRequestInput: event.detail.value });
  },

  onAddCustomFoodRequest() {
    const name = String(this.data.customFoodRequestInput || '').trim().slice(0, 50);
    if (!name) {
      wx.showToast({ title: '请输入自定义需求', icon: 'none' });
      return;
    }
    const availableCustomRequests = this.data.form.availableCustomRequests.includes(name)
      ? this.data.form.availableCustomRequests
      : [...this.data.form.availableCustomRequests, name];
    const nextForm = { ...this.data.form, availableCustomRequests };
    this.setData({
      'form.availableCustomRequests': availableCustomRequests,
      customFoodRequestInput: '',
      ...this.getFoodOptionViewData(nextForm),
    });
    wx.showToast({ title: '已添加需求', icon: 'success' });
  },

  onRemoveCustomFoodRequest(event) {
    const name = event.currentTarget.dataset.name;
    const availableCustomRequests = this.data.form.availableCustomRequests
      .filter(item => item !== name);
    const nextForm = { ...this.data.form, availableCustomRequests };
    this.setData({
      'form.availableCustomRequests': availableCustomRequests,
      ...this.getFoodOptionViewData(nextForm),
    });
  },

  onCustomCupSizeInput(event) {
    this.setData({ customCupSizeInput: event.detail.value });
  },

  onAddCustomCupSize() {
    const name = String(this.data.customCupSizeInput || '').trim().slice(0, 50);
    if (!name) {
      wx.showToast({ title: '请输入杯型名称', icon: 'none' });
      return;
    }
    const availableCupSizes = this.data.form.availableCupSizes.includes(name)
      ? this.data.form.availableCupSizes
      : [...this.data.form.availableCupSizes, name];
    const nextForm = { ...this.data.form, availableCupSizes };
    this.setData({
      'form.availableCupSizes': availableCupSizes,
      customCupSizeInput: '',
      ...this.getDrinkOptionViewData(nextForm),
    });
    wx.showToast({ title: '已添加杯型', icon: 'success' });
  },

  onRemoveCustomCupSize(event) {
    const name = event.currentTarget.dataset.name;
    const availableCupSizes = this.data.form.availableCupSizes.filter(item => item !== name);
    const nextForm = { ...this.data.form, availableCupSizes };
    this.setData({
      'form.availableCupSizes': availableCupSizes,
      ...this.getDrinkOptionViewData(nextForm),
    });
  },

  onToggleToppingGroup(event) {
    const key = event.currentTarget.dataset.key;
    const toppingGroups = this.data.toppingGroups.map(group => (
      group.key === key ? { ...group, expanded: !group.expanded } : group
    ));
    this.setData({ toppingGroups });
  },

  onToppingGroupChange(event) {
    const key = event.currentTarget.dataset.key;
    const group = TOPPING_GROUPS.find(item => item.key === key);
    if (!group) return;
    const selectedInGroup = Array.isArray(event.detail.value) ? event.detail.value : [];
    const retained = this.data.form.availableToppings.filter(name => !group.options.includes(name));
    const availableToppings = [...retained, ...selectedInGroup];
    const nextForm = { ...this.data.form, availableToppings };
    this.setData({
      'form.availableToppings': availableToppings,
      ...this.getDrinkOptionViewData(nextForm),
    });
  },

  onCustomToppingInput(event) {
    this.setData({ customToppingInput: event.detail.value });
  },

  onAddCustomTopping() {
    const name = String(this.data.customToppingInput || '').trim().slice(0, 50);
    if (!name) {
      wx.showToast({ title: '请输入小料名称', icon: 'none' });
      return;
    }
    const availableToppings = this.data.form.availableToppings.includes(name)
      ? this.data.form.availableToppings
      : [...this.data.form.availableToppings, name];
    const nextForm = { ...this.data.form, availableToppings };
    this.setData({
      'form.availableToppings': availableToppings,
      customToppingInput: '',
      ...this.getDrinkOptionViewData(nextForm),
    });
    wx.showToast({ title: '已添加小料', icon: 'success' });
  },

  onRemoveCustomTopping(event) {
    const name = event.currentTarget.dataset.name;
    const availableToppings = this.data.form.availableToppings.filter(item => item !== name);
    const nextForm = { ...this.data.form, availableToppings };
    this.setData({
      'form.availableToppings': availableToppings,
      ...this.getDrinkOptionViewData(nextForm),
    });
  },

  onAddIngredient() {
    const ingredients = [
      ...this.data.form.ingredients,
      { id: createEditorItemId('ingredient'), name: '', amount: '', note: '' },
    ];
    this.setData({ 'form.ingredients': ingredients });
  },

  onIngredientInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    if (!Number.isInteger(index) || !['name', 'amount', 'note'].includes(field)) return;
    const ingredients = this.data.form.ingredients.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: event.detail.value } : item
    ));
    this.setData({ 'form.ingredients': ingredients });
  },

  async onDeleteIngredient(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.form.ingredients.length) return;
    const ingredient = this.data.form.ingredients[index];
    const confirmed = await confirmRemoval('确定删除这个食材吗？');
    if (!confirmed) return;
    // 弹窗期间数组可能发生变化，因此使用稳定 id 重新定位，不误删其他食材。
    const currentIndex = this.data.form.ingredients.findIndex(item => item.id === ingredient.id);
    if (currentIndex < 0) return;
    const ingredients = this.data.form.ingredients.filter((item, itemIndex) => itemIndex !== currentIndex);
    this.setData({ 'form.ingredients': ingredients });
  },

  onMoveIngredient(event) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction;
    this.setData({ 'form.ingredients': movedItem(this.data.form.ingredients, index, direction) });
  },

  onAddStep() {
    const steps = resequenceSteps([
      ...this.data.form.steps,
      {
        id: createEditorItemId('step'),
        stepNumber: this.data.form.steps.length + 1,
        title: '',
        description: '',
        image: '',
      },
    ]);
    imageCache.setImageData(this, { 'form.steps': steps });
  },

  onStepInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    if (!Number.isInteger(index) || !['title', 'description'].includes(field)) return;
    const steps = this.data.form.steps.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: event.detail.value } : item
    ));
    imageCache.setImageData(this, { 'form.steps': resequenceSteps(steps) });
  },

  async onDeleteStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.form.steps.length) return;
    const step = this.data.form.steps[index];
    const content = step.image
      ? '删除步骤后，该步骤将不再显示。已上传的图片暂不从云存储删除。'
      : '确定删除这个制作步骤吗？';
    const confirmed = await confirmRemoval(content);
    if (!confirmed) return;
    // 保留其他步骤的稳定 id，只对剩余数组重新生成连续 stepNumber。
    const currentIndex = this.data.form.steps.findIndex(item => item.id === step.id);
    if (currentIndex < 0) return;
    const steps = this.data.form.steps.filter((item, itemIndex) => itemIndex !== currentIndex);
    imageCache.setImageData(this, { 'form.steps': resequenceSteps(steps) });
  },

  onMoveStep(event) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction;
    imageCache.setImageData(this, { 'form.steps': resequenceSteps(movedItem(this.data.form.steps, index, direction)) });
  },

  async onChooseStepImage(event) {
    if (this.data.uploading) return;
    const index = Number(event.currentTarget.dataset.index);
    const step = this.data.form.steps[index];
    if (!step) return;
    let paths;
    try {
      paths = await this.chooseImages(1);
    } catch (error) {
      console.error('选择步骤图片失败', error);
      wx.showToast({ title: '选择图片失败', icon: 'none' });
      return;
    }
    if (!paths.length) return;

    let uploadedFileID = '';
    let uploadError = null;
    this.setData({ uploading: true });
    try {
      wx.showLoading({ title: '上传中', mask: true });
      const purpose = this.data.form.type === 'drink' ? 'drink-step' : 'dish-step';
      const result = await imageService.uploadImage(paths[0], purpose);
      uploadedFileID = result.fileID;
      const currentIndex = this.data.form.steps.findIndex(item => item.id === step.id);
      if (currentIndex >= 0) {
        const steps = this.data.form.steps.map((item, itemIndex) => (
          itemIndex === currentIndex ? { ...item, image: uploadedFileID } : item
        ));
        // 只有新图片上传成功后才替换原 fileID。
        imageCache.setImageData(this, { 'form.steps': resequenceSteps(steps) });
      }
    } catch (error) {
      uploadError = error;
      console.error('步骤图片上传失败', error);
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
    if (uploadError) {
      wx.showToast({ title: uploadError.message || '上传失败', icon: 'none' });
    } else if (uploadedFileID) {
      wx.showToast({ title: '上传成功', icon: 'success' });
    }
  },

  onRemoveStepImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.form.steps.length) return;
    const steps = this.data.form.steps.map((item, itemIndex) => (
      itemIndex === index ? { ...item, image: '' } : item
    ));
    imageCache.setImageData(this, { 'form.steps': steps });
  },

  async onPreviewStepImage(event) {
    const current = event.currentTarget.dataset.url;
    if (current) {
      const local = await imageCache.resolveImage(current);
      wx.previewImage({ current: local, urls: [local] });
    }
  },

  chooseImages(count) {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: result => resolve((result.tempFiles || [])
          .map(file => file.tempFilePath)
          .filter(Boolean)),
        fail: error => {
          if (error && String(error.errMsg || '').includes('cancel')) resolve([]);
          else reject(error);
        },
      });
    });
  },

  async onChooseCover() {
    if (this.data.uploading) return;
    let paths;
    try {
      paths = await this.chooseImages(1);
    } catch (error) {
      console.error('选择主图失败', error);
      wx.showToast({ title: '选择图片失败', icon: 'none' });
      return;
    }
    if (!paths.length) return;

    let uploadedFileID = '';
    let uploadError = null;
    this.setData({ uploading: true });
    try {
      wx.showLoading({ title: '上传中', mask: true });
      const isDrink = this.data.form.type === 'drink';
      // 主图和菜单小图同时上传；小图失败不影响主图，菜单会退回用主图。
      const [result, thumbFileID] = await Promise.all([
        imageService.uploadImage(paths[0], isDrink ? 'drink-cover' : 'dish-cover'),
        imageService.uploadThumbnail(paths[0], isDrink ? 'drink-thumb' : 'dish-thumb'),
      ]);
      uploadedFileID = result.fileID;
      // 只有云存储上传成功并取得 fileID 后才替换原主图。
      imageCache.setImageData(this, {
        'form.cover': uploadedFileID,
        'form.coverThumb': thumbFileID,
        'form.coverThumbOf': thumbFileID ? uploadedFileID : '',
      });
    } catch (error) {
      uploadError = error;
      console.error('主图上传失败', error);
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
    if (uploadError) {
      wx.showToast({ title: uploadError.message || '上传失败', icon: 'none' });
    } else if (uploadedFileID) {
      wx.showToast({ title: '上传成功', icon: 'success' });
    }
  },

  async onAddImages() {
    if (this.data.uploading) return;
    const remaining = Math.max(0, 6 - this.data.form.images.length);
    if (!remaining) {
      wx.showToast({ title: '最多添加 6 张其他图片', icon: 'none' });
      return;
    }
    let paths;
    try {
      paths = await this.chooseImages(remaining);
    } catch (error) {
      console.error('选择其他图片失败', error);
      wx.showToast({ title: '选择图片失败', icon: 'none' });
      return;
    }
    if (!paths.length) return;

    let uploadError = null;
    let uploaded = [];
    this.setData({ uploading: true });
    try {
      wx.showLoading({ title: '上传中', mask: true });
      const purpose = this.data.form.type === 'drink' ? 'drink-gallery' : 'dish-gallery';
      // 多张图并发上传（同时 2 张），比逐张串行快一倍左右。
      const results = await imageService.uploadImages(paths, purpose);
      uploaded = results.map(result => result.fileID);
      const images = [...this.data.form.images, ...uploaded].filter((url, index, list) => list.indexOf(url) === index);
      imageCache.setImageData(this, { 'form.images': images }, null, { details: true });
    } catch (error) {
      uploadError = error;
      uploaded = [];
      console.error('其他图片上传失败', error);
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
    if (uploadError) {
      wx.showToast({ title: uploadError.message || '上传失败', icon: 'none' });
    } else {
      wx.showToast({ title: '上传成功', icon: 'success' });
    }
  },

  onRemoveImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = [...this.data.form.images];
    if (!Number.isInteger(index) || index < 0 || index >= images.length) return;
    images.splice(index, 1);
    imageCache.setImageData(this, { 'form.images': images }, null, { details: true });
  },

  async onPreviewImage(event) {
    const current = event.currentTarget.dataset.url;
    const urls = [this.data.form.cover, ...this.data.form.images].filter(Boolean);
    if (current && urls.length) {
      const localUrls = await imageCache.resolveImages(urls);
      wx.previewImage({ current: await imageCache.resolveImage(current), urls: localUrls });
    }
  },

  validateForm() {
    const form = this.data.form;
    if (!String(form.name || '').trim()) return '请填写菜品或饮品名称';
    if (!form.categoryId) return '请选择分类';
    if (!['food', 'drink'].includes(form.type)) return '类型必须是菜品或饮品';
    if (form.price !== '' && form.price !== null) {
      const price = Number(form.price);
      if (!Number.isFinite(price) || price < 0 || price > 999999) return '价格格式不正确';
    }
    if (!Number.isFinite(Number(form.sort))) return '排序值必须是数字';
    if (form.legacyCover && !form.cover) return '旧主图需重新上传到云存储';
    if (form.cover && !imageService.isCloudFileID(form.cover)) return '主图必须先上传到云存储';
    if (form.images.some(item => !imageService.isCloudFileID(item))) return '其他图片包含无效云存储 fileID';
    for (let index = 0; index < form.ingredients.length; index += 1) {
      if (!String(form.ingredients[index].name || '').trim()) return `第 ${index + 1} 项食材名称不能为空`;
    }
    for (let index = 0; index < form.steps.length; index += 1) {
      const step = form.steps[index];
      if (!String(step.description || '').trim()) return `步骤 ${index + 1} 的说明不能为空`;
      if (step.image && !imageService.isCloudFileID(step.image)) return `步骤 ${index + 1} 的图片不是有效云文件`;
    }
    const category = this.data.categories.find(item => item.id === form.categoryId);
    if (!category) return '所选分类不存在';
    if (category.enabled === false) return '所选分类已停用，请重新选择分类';
    const categoryType = category.type || 'all';
    if (categoryType !== 'all' && categoryType !== form.type) return '菜品类型与分类类型不一致';
    return '';
  },

  async onSave() {
    if (!this.data.isAdmin || this.data.saving || this.data.uploading) return;
    const validationMessage = this.validateForm();
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' });
      return;
    }
    const {
      tagsText,
      legacyCover,
      legacyImagesCount,
      ...base
    } = this.data.form;
    const payload = {
      ...base,
      name: String(base.name).trim(),
      tags: tagsText,
      ingredients: base.ingredients.map(item => ({
        id: item.id,
        name: String(item.name || '').trim(),
        amount: String(item.amount || '').trim(),
        note: String(item.note || '').trim(),
      })),
      steps: resequenceSteps(base.steps).map(step => ({
        id: step.id,
        stepNumber: step.stepNumber,
        title: String(step.title || '').trim(),
        description: String(step.description || '').trim(),
        image: step.image || '',
      })),
      sort: Number(base.sort),
      availableCupSizes: base.type === 'drink' && Array.isArray(base.availableCupSizes)
        ? [...base.availableCupSizes]
        : [],
      availableSugarLevels: base.type === 'drink' && Array.isArray(base.availableSugarLevels)
        ? [...base.availableSugarLevels]
        : [],
      availableTemperatures: base.type === 'drink' && Array.isArray(base.availableTemperatures)
        ? [...base.availableTemperatures]
        : [],
      availableSweetenerTypes: base.type === 'drink' && Array.isArray(base.availableSweetenerTypes)
        ? [...base.availableSweetenerTypes]
        : [],
      availableToppings: base.type === 'drink' && Array.isArray(base.availableToppings)
        ? [...base.availableToppings]
        : [],
      availableTastePreferences: base.type === 'food' && Array.isArray(base.availableTastePreferences)
        ? [...base.availableTastePreferences]
        : [],
      availableCustomRequests: base.type === 'food' && Array.isArray(base.availableCustomRequests)
        ? [...base.availableCustomRequests]
        : [],
      mealRoles: normalizeMealRoles(base.mealRoles, base.type, { strict: true }),
    };
    // 便于在微信开发者工具 Console 中核对真正送入 service / familyApi 的全部饮品规格。
    console.log('SAVE DISH PAYLOAD:', payload);
    let saveError = null;
    let saved = false;
    this.setData({ saving: true });
    try {
      wx.showLoading({ title: '保存中', mask: true });
      if (this.data.dishId) await catalogService.updateDish(this.data.dishId, payload);
      else await catalogService.createDish(payload);
      saved = true;
    } catch (error) {
      saveError = error;
      console.error('保存菜品失败', error);
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
    if (saveError) {
      wx.showToast({ title: saveError.message || '保存失败', icon: 'none' });
    } else if (saved) {
      wx.showToast({ title: this.data.dishId ? '已更新' : '已添加', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    }
  },
});
