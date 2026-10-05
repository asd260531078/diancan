const {
  buildSummaryText,
  canonicalizeSelectedOptions,
  hasDrinkOptions,
  hasFoodOptions,
} = require('../../utils/cart');

function emptySelectedOptions(type) {
  return type === 'drink'
    ? { cupSize: '', sugarLevel: '', temperature: '', sweetener: '', toppings: [] }
    : { tastePreference: '', customRequests: [] };
}

function needsMealCustomization(dish = {}) {
  return dish.type === 'drink' ? hasDrinkOptions(dish) : hasFoodOptions(dish);
}

function createMealBatch(entries = []) {
  const normalizedEntries = (Array.isArray(entries) ? entries : []).map(entry => {
    const dish = entry && entry.dish ? entry.dish : entry;
    const quantity = entry && entry.dish ? entry.quantity : 1;
    return {
      dish: { ...(dish || {}) },
      quantity: Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1))),
    };
  });
  return {
    dishes: normalizedEntries.map(entry => entry.dish),
    quantities: normalizedEntries.map(entry => entry.quantity),
    index: 0,
    selections: [],
    cancelled: false,
  };
}

function currentMealBatchQuantity(batch) {
  if (!batch || batch.cancelled) return 1;
  return Math.max(1, Math.min(99, Math.floor(Number(batch.quantities && batch.quantities[batch.index]) || 1)));
}

function currentMealBatchDish(batch) {
  return batch && !batch.cancelled ? batch.dishes[batch.index] || null : null;
}

function recordMealBatchSelection(batch, selectedOptions, quantity) {
  const dish = currentMealBatchDish(batch);
  if (!dish) throw new Error('没有等待配置的随机菜品');
  const canonical = canonicalizeSelectedOptions(dish.type, selectedOptions || emptySelectedOptions(dish.type));
  const safeQuantity = quantity === undefined
    ? currentMealBatchQuantity(batch)
    : Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
  return {
    ...batch,
    index: batch.index + 1,
    selections: [...batch.selections, {
      dish,
      dishId: dish.id || dish._id,
      quantity: safeQuantity,
      selectedOptions: canonical,
      summaryText: buildSummaryText(dish.type, canonical),
    }],
  };
}

function cancelMealBatch(batch) {
  return { ...(batch || {}), index: 0, selections: [], cancelled: true };
}

function isMealBatchComplete(batch) {
  return Boolean(batch && !batch.cancelled && batch.index >= batch.dishes.length);
}

function getMealBatchSelections(batch) {
  return isMealBatchComplete(batch) ? batch.selections.map(item => ({ ...item })) : [];
}

module.exports = {
  cancelMealBatch,
  createMealBatch,
  currentMealBatchDish,
  currentMealBatchQuantity,
  emptySelectedOptions,
  getMealBatchSelections,
  isMealBatchComplete,
  needsMealCustomization,
  recordMealBatchSelection,
};
