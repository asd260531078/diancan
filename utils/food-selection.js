const { buildSummaryText, canonicalizeSelectedOptions, normalizeUnitPrice } = require('./cart');
const { normalizeFoodOptionList } = require('../config/food-options');

function getSupportedFoodOptions(dish = {}) {
  return {
    tastePreferences: normalizeFoodOptionList(dish.availableTastePreferences, 30),
    customRequests: normalizeFoodOptionList(dish.availableCustomRequests, 100),
  };
}

function initializeFoodSelection(dish = {}, initialOptions = {}) {
  const supported = getSupportedFoodOptions(dish);
  const initial = canonicalizeSelectedOptions('food', initialOptions);
  let tastePreference = supported.tastePreferences.includes(initial.tastePreference)
    ? initial.tastePreference
    : '';
  if (!tastePreference && supported.tastePreferences.length === 1) {
    [tastePreference] = supported.tastePreferences;
  }
  return canonicalizeSelectedOptions('food', {
    tastePreference,
    customRequests: initial.customRequests.filter(item => supported.customRequests.includes(item)),
  });
}

function selectTastePreference(dish = {}, selectedOptions = {}, value) {
  const supported = getSupportedFoodOptions(dish).tastePreferences;
  const safeValue = String(value || '').trim();
  if (!supported.includes(safeValue)) return canonicalizeSelectedOptions('food', selectedOptions);
  return canonicalizeSelectedOptions('food', { ...selectedOptions, tastePreference: safeValue });
}

function toggleCustomRequest(dish = {}, selectedOptions = {}, value) {
  const supported = getSupportedFoodOptions(dish).customRequests;
  const safeValue = String(value || '').trim();
  const current = canonicalizeSelectedOptions('food', selectedOptions);
  if (!supported.includes(safeValue)) return current;
  const selected = current.customRequests.includes(safeValue);
  return canonicalizeSelectedOptions('food', {
    ...current,
    customRequests: selected
      ? current.customRequests.filter(item => item !== safeValue)
      : [...current.customRequests, safeValue],
  });
}

function getMissingFoodSelections(dish = {}, selectedOptions = {}) {
  const supported = getSupportedFoodOptions(dish);
  const selected = canonicalizeSelectedOptions('food', selectedOptions);
  if (supported.tastePreferences.length > 0
      && !supported.tastePreferences.includes(selected.tastePreference)) {
    return [{ key: 'tastePreference', label: '口味', message: '请选择口味' }];
  }
  return [];
}

function getFoodSelectionView(dish = {}, selectedOptions = {}) {
  const supported = getSupportedFoodOptions(dish);
  const selected = canonicalizeSelectedOptions('food', selectedOptions);
  const missing = getMissingFoodSelections(dish, selected);
  return {
    selectedOptions: selected,
    tasteOptions: supported.tastePreferences.map(value => ({
      value,
      selected: selected.tastePreference === value,
    })),
    requestOptions: supported.customRequests.map(value => ({
      value,
      selected: selected.customRequests.includes(value),
    })),
    summaryText: buildSummaryText('food', selected),
    missing,
    canConfirm: missing.length === 0,
  };
}

function getFoodLineAmount(price, quantity) {
  const unitPrice = normalizeUnitPrice(price);
  if (unitPrice === null) return null;
  const safeQuantity = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
  return Math.round(unitPrice * safeQuantity * 100) / 100;
}

module.exports = {
  getFoodLineAmount,
  getFoodSelectionView,
  getMissingFoodSelections,
  getSupportedFoodOptions,
  initializeFoodSelection,
  selectTastePreference,
  toggleCustomRequest,
};
