const { categoryForWrite, dishForWrite } = require('./schema');
const { getMenuSeedV1 } = require('./data/menu-seed-v1');
const { getMenuSeedV2Additions } = require('./data/menu-seed-v2-additions');
const { getMenuSeedV3Additions } = require('./data/menu-seed-v3-additions');

const docId = item => item && (item._id || item.id) || '';
const text = value => typeof value === 'string' ? value.trim() : '';
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const hasRecipeArray = (value, legacy) => (Array.isArray(value) && value.length > 0)
  || Boolean(text(value))
  || Boolean(text(legacy));

function categoryType(raw) {
  if (hasOwn(raw, 'type') && text(raw.type)) return raw.type;
  if (hasOwn(raw, 'itemType') && text(raw.itemType)) return raw.itemType;
  return '';
}

function dishMatches(raw, category, item) {
  const rawCategory = text(raw.categoryId);
  const sameCategory = rawCategory
    ? rawCategory === category.id
    : text(raw.categoryName || raw.category) === category.name;
  const rawType = text(raw.type) || category.type;
  return sameCategory && rawType === category.type && text(raw.name) === item.name;
}

function prepareMenuSeedPlan(rawCategories = [], rawDishes = [], options = {}) {
  const additionSeedGetters = {
    'v2-additions': getMenuSeedV2Additions,
    'v3-additions': getMenuSeedV3Additions,
  };
  const additionsOnly = Boolean(additionSeedGetters[options.seed]);
  const seed = additionsOnly ? additionSeedGetters[options.seed]() : getMenuSeedV1();
  const preserveExistingCompletely = options.seed === 'v3-additions';
  const plan = {
    categoriesToCreate: [], categoriesToBackfill: [], dishesToCreate: [], recipesToBackfill: [],
    summary: {
      dryRun: true, targetCategories: seed.length, targetDishes: 0,
      targetFood: 0, targetDrink: 0,
      categoriesToCreate: 0, categoriesReused: 0, categoriesToBackfill: 0,
      dishesToCreate: 0, dishesReused: 0, recipesToBackfill: 0, dishesSkipped: 0,
      conflicts: [], warnings: [],
    },
  };
  const summary = plan.summary;
  if (additionsOnly) {
    summary.targetDishes = seed.reduce((total, category) => total + category.items.length, 0);
    summary.targetFood = seed.filter(category => category.type === 'food')
      .reduce((total, category) => total + category.items.length, 0);
    summary.targetDrink = summary.targetDishes - summary.targetFood;
  }
  const usedCategoryIds = new Set(rawCategories.map(docId));
  const usedDishIds = new Set(rawDishes.map(docId));

  seed.forEach(seedCategory => {
    const desired = additionsOnly ? null : categoryForWrite(seedCategory);
    const matching = rawCategories.filter(raw => text(raw.name) === seedCategory.name);
    if (matching.length > 1) {
      summary.conflicts.push(`分类“${seedCategory.name}”已有 ${matching.length} 条同名记录，请先人工核对。`);
      return;
    }
    let category;
    if (matching.length) {
      const raw = matching[0];
      const actualType = categoryType(raw);
      if (actualType && actualType !== seedCategory.type) {
        summary.conflicts.push(`分类“${seedCategory.name}”现有类型为 ${actualType}，目标为 ${seedCategory.type}；不会覆盖管理员配置。`);
        return;
      }
      category = { id: docId(raw), name: seedCategory.name, type: seedCategory.type };
      summary.categoriesReused += 1;
      if (!additionsOnly) {
        const patch = {};
        if (!text(raw.type)) patch.type = seedCategory.type;
        if (!hasOwn(raw, 'sort') || raw.sort === null || raw.sort === '') patch.sort = desired.sort;
        if (!hasOwn(raw, 'enabled') || raw.enabled === null) patch.enabled = true;
        if (Object.keys(patch).length) plan.categoriesToBackfill.push({ id: category.id, patch });
        if (hasOwn(raw, 'sort') && Number(raw.sort) !== seedCategory.sort) {
          summary.warnings.push(`分类“${seedCategory.name}”保留现有排序 ${raw.sort}，目标序号为 ${seedCategory.sort}。`);
        }
      }
      if (raw.enabled === false) summary.warnings.push(`分类“${seedCategory.name}”保持停用，导入的商品暂不会在普通菜单显示。`);
    } else {
      if (additionsOnly) {
        summary.conflicts.push(`分类“${seedCategory.name}”不存在；本批次只追加商品，不会创建或修改分类。`);
        return;
      }
      if (usedCategoryIds.has(seedCategory.id)) {
        summary.conflicts.push(`预设分类 ID ${seedCategory.id} 已被其他分类占用。`);
        return;
      }
      category = { id: seedCategory.id, name: seedCategory.name, type: seedCategory.type };
      plan.categoriesToCreate.push({ ...desired, id: seedCategory.id });
    }

    let nextSort = additionsOnly ? Math.max(0, ...rawDishes
      .filter(raw => text(raw.categoryId)
        ? text(raw.categoryId) === category.id
        : text(raw.categoryName || raw.category) === category.name)
      .map(raw => Number(raw.sort))
      .filter(Number.isFinite)) : 0;

    seedCategory.items.forEach(item => {
      if (!additionsOnly) {
        summary.targetDishes += 1;
        if (item.type === 'food') summary.targetFood += 1;
        else summary.targetDrink += 1;
      }
      const normalized = dishForWrite({ ...item, categoryId: category.id }, category);
      const existing = rawDishes.filter(raw => dishMatches(raw, category, item));
      if (existing.length > 1) {
        summary.conflicts.push(`“${seedCategory.name} / ${item.name}”已有 ${existing.length} 条相同商品，请先人工核对。`);
        return;
      }
      if (!existing.length) {
        if (usedDishIds.has(item.id)) {
          summary.conflicts.push(`预设商品 ID ${item.id} 已被其他商品占用。`);
          return;
        }
        if (additionsOnly) nextSort += 10;
        plan.dishesToCreate.push({ ...item, categoryId: category.id, sort: additionsOnly ? nextSort : item.sort });
        if (additionsOnly) usedDishIds.add(item.id);
        return;
      }
      summary.dishesReused += 1;
      if (preserveExistingCompletely) {
        summary.dishesSkipped += 1;
        return;
      }
      const raw = existing[0];
      const patch = {};
      if (!hasRecipeArray(raw.ingredients, raw.legacyIngredients)) patch.ingredients = normalized.ingredients;
      if (!hasRecipeArray(raw.steps, raw.legacySteps)) patch.steps = normalized.steps;
      if (!text(raw.tips)) patch.tips = normalized.tips;
      if (Object.keys(patch).length) plan.recipesToBackfill.push({ id: docId(raw), patch });
      else summary.dishesSkipped += 1;
    });
  });

  summary.categoriesToCreate = plan.categoriesToCreate.length;
  summary.categoriesToBackfill = plan.categoriesToBackfill.length;
  summary.dishesToCreate = plan.dishesToCreate.length;
  summary.recipesToBackfill = plan.recipesToBackfill.length;
  return plan;
}

module.exports = { prepareMenuSeedPlan };
