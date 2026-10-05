const { normalizeMealRoles, MEAL_ROLE_LABELS } = require('../../config/meal-roles');
const { canOrderDish } = require('../../utils/dish-status');
const { normalizeUnitPrice } = require('../../utils/cart');

const MAX_FOOD_CATEGORY_SELECTION = 5;
const MAX_FOOD_CATEGORY_COUNT = 5;

function dishId(dish = {}) {
  return String(dish.id || dish._id || '').trim();
}

function buildMealCandidates(dishes = [], categories = []) {
  const enabledCategoryIds = new Set((Array.isArray(categories) ? categories : [])
    .filter(category => category && category.enabled !== false)
    .map(category => String(category.id || category._id || '').trim())
    .filter(Boolean));
  const enabledCategoryNames = new Set((Array.isArray(categories) ? categories : [])
    .filter(category => category && category.enabled !== false)
    .map(category => String(category.name || '').trim())
    .filter(Boolean));
  return (Array.isArray(dishes) ? dishes : [])
    .filter(dish => dishId(dish) && canOrderDish(dish))
    .filter(dish => enabledCategoryIds.has(String(dish.categoryId || '').trim())
      || enabledCategoryNames.has(String(dish.categoryName || dish.category || '').trim()))
    .map(dish => ({
      ...dish,
      mealRoles: normalizeMealRoles(dish.mealRoles, dish.type),
    }));
}

function randomItem(items, random) {
  if (!items.length) return null;
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  return items[Math.floor(normalized * items.length)];
}

function categoryId(category = {}) {
  return String(category.id || category._id || '').trim();
}

function categorySort(left = {}, right = {}) {
  const leftSort = Number.isFinite(Number(left.sort)) ? Number(left.sort) : 0;
  const rightSort = Number.isFinite(Number(right.sort)) ? Number(right.sort) : 0;
  return leftSort - rightSort || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN');
}

function isVirtualAllCategory(category = {}) {
  const id = categoryId(category).toLowerCase();
  const name = String(category.name || '').trim();
  return id === 'all' || name === '全部';
}

function getCandidatesByCategory(dishes = [], categories = [], selectedCategoryId, type) {
  const selectedId = String(selectedCategoryId || '').trim();
  if (!selectedId || !['food', 'drink'].includes(type)) return [];
  return buildMealCandidates(dishes, categories)
    .filter(dish => dish.type === type && String(dish.categoryId || '').trim() === selectedId);
}

function getEligibleCategories(dishes = [], categories = [], type) {
  if (!['food', 'drink'].includes(type)) return [];
  const candidates = buildMealCandidates(dishes, categories).filter(dish => dish.type === type);
  const categoryIdsWithCandidates = new Set(candidates.map(dish => String(dish.categoryId || '').trim()));
  return (Array.isArray(categories) ? categories : [])
    .filter(category => category && category.enabled !== false)
    .filter(category => !isVirtualAllCategory(category))
    .filter(category => category.type === type || category.type === 'all')
    .filter(category => categoryIdsWithCandidates.has(categoryId(category)))
    .slice()
    .sort(categorySort);
}

function getEligibleFoodCategories(dishes = [], categories = []) {
  return getEligibleCategories(dishes, categories, 'food');
}

function getEligibleDrinkCategories(dishes = [], categories = []) {
  return getEligibleCategories(dishes, categories, 'drink');
}

function getFoodCategoryMaxCount(dishes = [], categories = [], selectedCategoryId) {
  const ids = new Set(getCandidatesByCategory(dishes, categories, selectedCategoryId, 'food').map(dishId));
  return Math.min(MAX_FOOD_CATEGORY_COUNT, ids.size);
}

function avoidImmediateRepeat(items = [], previousId = '', random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const safePreviousId = String(previousId || '').trim();
  const alternatives = items.filter(item => dishId(item) !== safePreviousId);
  return randomItem(alternatives.length > 0 ? alternatives : items, random);
}

function normalizeFoodCategoryIds(value, maxSelection = MAX_FOOD_CATEGORY_SELECTION) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  const limit = Math.max(1, Number(maxSelection) || MAX_FOOD_CATEGORY_SELECTION);
  return values
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, limit);
}

function toggleFoodCategorySelection(currentIds = [], categoryIdValue = '', maxSelection = MAX_FOOD_CATEGORY_SELECTION) {
  const ids = normalizeFoodCategoryIds(currentIds, maxSelection);
  const selectedId = String(categoryIdValue || '').trim();
  if (!selectedId) return { ids, limitReached: false };
  if (ids.includes(selectedId)) {
    return { ids: ids.filter(id => id !== selectedId), limitReached: false };
  }
  if (ids.length >= maxSelection) return { ids, limitReached: true };
  return { ids: [...ids, selectedId], limitReached: false };
}

function normalizeFoodCategoryCounts(value, foodCategoryIds) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const counts = {};
  foodCategoryIds.forEach(id => {
    const requested = Number(source[id]);
    counts[id] = Number.isFinite(requested) && requested >= 1
      ? Math.min(MAX_FOOD_CATEGORY_COUNT, Math.floor(requested))
      : 1;
  });
  return counts;
}

function shuffledCopy(items, random) {
  const shuffled = items.slice();
  for (let index = 0; index < shuffled.length; index += 1) {
    const value = Number(random());
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
    const nextIndex = index + Math.floor(normalized * (shuffled.length - index));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

function previousIdsForCategory(previous = {}, selectedCategoryId, singleCategory) {
  const byCategory = previous.foodDishByCategory || previous.previousDishByCategory || {};
  const value = byCategory[selectedCategoryId] || (singleCategory ? previous.foodId : '');
  return new Set((Array.isArray(value) ? value : [value]).map(id => String(id || '').trim()).filter(Boolean));
}

function normalizeCategoryGuidedSelection(selection = {}) {
  const includeDrink = selection.includeDrink === true
    ? true
    : (selection.includeDrink === false ? false : null);
  const foodCategoryIds = normalizeFoodCategoryIds(
    Array.isArray(selection.foodCategoryIds) ? selection.foodCategoryIds : selection.foodCategoryId,
  );
  return {
    foodCategoryIds,
    foodCategoryCounts: normalizeFoodCategoryCounts(selection.foodCategoryCounts, foodCategoryIds),
    includeDrink,
    drinkCategoryId: includeDrink ? String(selection.drinkCategoryId || '').trim() : '',
  };
}

function generateCategoryGuidedMeal(dishes = [], categories = [], selection = {}, previous = {}, options = {}) {
  const normalizedSelection = normalizeCategoryGuidedSelection(selection);
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const categoryById = new Map((Array.isArray(categories) ? categories : [])
    .map(category => [categoryId(category), category]));
  const foodCandidatesByCategory = {};
  const foodItems = [];
  const limitedFoodCategories = [];
  const usedDishIds = new Set();
  let missingFoodCategory = normalizedSelection.foodCategoryIds.length === 0
    ? { id: '', name: '' }
    : null;

  for (const selectedCategoryId of normalizedSelection.foodCategoryIds) {
    const candidates = getCandidatesByCategory(dishes, categories, selectedCategoryId, 'food');
    foodCandidatesByCategory[selectedCategoryId] = candidates;
    const seenCandidateIds = new Set();
    const availableCandidates = candidates.filter(dish => {
      const id = dishId(dish);
      if (usedDishIds.has(id) || seenCandidateIds.has(id)) return false;
      seenCandidateIds.add(id);
      return true;
    });
    const category = categoryById.get(selectedCategoryId) || {};
    if (availableCandidates.length === 0) {
      missingFoodCategory = {
        id: selectedCategoryId,
        name: String(category.name || selectedCategoryId),
      };
      break;
    }
    const requestedCount = normalizedSelection.foodCategoryCounts[selectedCategoryId];
    const actualCount = Math.min(requestedCount, availableCandidates.length);
    if (actualCount < requestedCount) {
      limitedFoodCategories.push({
        id: selectedCategoryId,
        name: String(category.name || selectedCategoryId),
        requestedCount,
        actualCount,
      });
    }
    const previousIds = previousIdsForCategory(
      previous,
      selectedCategoryId,
      normalizedSelection.foodCategoryIds.length === 1,
    );
    const fresh = availableCandidates.filter(dish => !previousIds.has(dishId(dish)));
    const repeated = availableCandidates.filter(dish => previousIds.has(dishId(dish)));
    const selectedDishes = [...shuffledCopy(fresh, random), ...shuffledCopy(repeated, random)]
      .slice(0, actualCount);
    selectedDishes.forEach(selectedDish => {
      usedDishIds.add(dishId(selectedDish));
      foodItems.push({
        role: 'food',
        roleLabel: String(category.name || '餐食'),
        categoryId: selectedCategoryId,
        categoryName: String(category.name || '餐食'),
        dish: selectedDish,
      });
    });
  }

  const drinkCandidates = normalizedSelection.includeDrink
    ? getCandidatesByCategory(dishes, categories, normalizedSelection.drinkCategoryId, 'drink')
    : [];
  const availableDrinkCandidates = drinkCandidates
    .filter(dish => !usedDishIds.has(dishId(dish)));
  const drink = normalizedSelection.includeDrink && !missingFoodCategory
    ? avoidImmediateRepeat(availableDrinkCandidates, previous.drinkId, random)
    : null;
  const items = missingFoodCategory ? [] : [...foodItems];
  if (drink) {
    const category = categoryById.get(normalizedSelection.drinkCategoryId) || {};
    items.push({
      role: 'drink',
      roleLabel: String(category.name || '饮品'),
      categoryId: normalizedSelection.drinkCategoryId,
      categoryName: String(category.name || '饮品'),
      dish: drink,
    });
  }
  const foodCandidates = Object.keys(foodCandidatesByCategory)
    .reduce((all, id) => all.concat(foodCandidatesByCategory[id]), []);
  return {
    selection: normalizedSelection,
    food: foodItems[0] ? foodItems[0].dish : null,
    foodItems: missingFoodCategory ? [] : foodItems,
    drink,
    foodCandidates,
    foodCandidatesByCategory,
    limitedFoodCategories,
    drinkCandidates,
    items,
    missingFoodCategory,
    missingFoodCandidates: Boolean(missingFoodCategory),
    missingDrinkCandidates: !missingFoodCategory
      && normalizedSelection.includeDrink
      && availableDrinkCandidates.length === 0,
    ...calculateMealDisplayTotal(items),
  };
}

function rolePool(candidates, role, usedIds) {
  return candidates.filter(dish => !usedIds.has(dishId(dish)) && dish.mealRoles.includes(role));
}

function typePool(candidates, type, usedIds) {
  return candidates.filter(dish => !usedIds.has(dishId(dish)) && dish.type === type);
}

function addChoice(items, usedIds, pool, role, random) {
  const dish = randomItem(pool, random);
  if (!dish) return false;
  usedIds.add(dishId(dish));
  items.push({ role, roleLabel: MEAL_ROLE_LABELS[role] || '菜品', dish });
  return true;
}

function generateCombination(candidates, random) {
  const items = [];
  const usedIds = new Set();
  const foods = candidates.filter(dish => dish.type === 'food');
  const drinks = candidates.filter(dish => dish.type === 'drink');

  if (!addChoice(items, usedIds, rolePool(foods, 'main', usedIds), 'main', random)) {
    addChoice(items, usedIds, typePool(foods, 'food', usedIds), 'food', random);
  }

  const secondPools = [
    ['side', rolePool(foods, 'side', usedIds)],
    ['staple', rolePool(foods, 'staple', usedIds)],
    ['soup', rolePool(foods, 'soup', usedIds)],
    ['food', typePool(foods, 'food', usedIds)],
  ];
  for (const [role, pool] of secondPools) {
    if (addChoice(items, usedIds, pool, role, random)) break;
  }

  addChoice(items, usedIds, typePool(drinks, 'drink', usedIds), 'drink', random);

  if (items.length === 0) {
    addChoice(items, usedIds, candidates, candidates[0] && candidates[0].type === 'drink' ? 'drink' : 'food', random);
  }
  return items;
}

function combinationIds(items = []) {
  return items.map(item => dishId(item.dish || item)).filter(Boolean).sort();
}

function isSameCombination(left = [], right = []) {
  const leftIds = combinationIds(left);
  const rightIds = combinationIds(right);
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function calculateMealDisplayTotal(items = []) {
  let cents = 0;
  let hasUnpricedItems = false;
  items.forEach(item => {
    const dish = item.dish || item;
    const price = normalizeUnitPrice(dish && dish.price);
    if (price === null) hasUnpricedItems = true;
    else cents += Math.round(price * 100);
  });
  return { displayTotalAmount: cents / 100, hasUnpricedItems };
}

function generateRandomMeal(dishes = [], categories = [], previousDishIds = [], options = {}) {
  const candidates = buildMealCandidates(dishes, categories);
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const maxAttempts = Math.max(1, Math.min(10, Number(options.maxAttempts) || 10));
  const previous = (Array.isArray(previousDishIds) ? previousDishIds : []).map(id => ({ id }));
  let items = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    items = generateCombination(candidates, random);
    if (items.length === 0 || previous.length === 0 || !isSameCombination(items, previous)) break;
  }
  return { items, candidates, ...calculateMealDisplayTotal(items) };
}

module.exports = {
  MAX_FOOD_CATEGORY_COUNT,
  MAX_FOOD_CATEGORY_SELECTION,
  avoidImmediateRepeat,
  buildMealCandidates,
  calculateMealDisplayTotal,
  categorySort,
  combinationIds,
  generateCategoryGuidedMeal,
  generateRandomMeal,
  getCandidatesByCategory,
  getEligibleDrinkCategories,
  getEligibleFoodCategories,
  getFoodCategoryMaxCount,
  isSameCombination,
  normalizeCategoryGuidedSelection,
  normalizeFoodCategoryCounts,
  normalizeFoodCategoryIds,
  toggleFoodCategorySelection,
};
