const { normalizeSugarLevels } = require('../config/drink-options');
const {
  buildSummaryText,
  canonicalizeSelectedOptions,
  normalizeUnitPrice,
} = require('./cart');

const SINGLE_GROUPS = [
  { key: 'cupSize', label: '杯型', source: 'availableCupSizes' },
  { key: 'sugarLevel', label: '甜度', source: 'availableSugarLevels' },
  { key: 'temperature', label: '温度', source: 'availableTemperatures' },
  { key: 'sweetener', label: '甜味来源', source: 'availableSweetenerTypes' },
];

function cleanString(value, maxLength = 80) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizeDisplayList(value, maxItems = 100) {
  return (Array.isArray(value) ? value : [])
    .map(item => cleanString(item))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, maxItems);
}

function getSupportedDrinkOptions(dish = {}) {
  const temperatures = normalizeDisplayList(
    Array.isArray(dish.availableTemperatures) && dish.availableTemperatures.length > 0
      ? dish.availableTemperatures
      : dish.availableIceLevels,
  );
  return {
    cupSize: normalizeDisplayList(dish.availableCupSizes, 20),
    sugarLevel: normalizeSugarLevels(dish.availableSugarLevels),
    temperature: temperatures,
    sweetener: normalizeDisplayList(dish.availableSweetenerTypes, 20),
    toppings: normalizeDisplayList(dish.availableToppings, 100),
  };
}

function getDrinkSpecGroups(dish = {}, selectedOptions = {}) {
  const supported = getSupportedDrinkOptions(dish);
  const groups = SINGLE_GROUPS.map(group => ({
    key: group.key,
    label: group.label,
    multiple: false,
    values: supported[group.key],
  })).filter(group => group.values.length > 0);
  if (supported.toppings.length > 0) {
    groups.push({ key: 'toppings', label: '小料', multiple: true, values: supported.toppings });
  }
  const canonical = canonicalizeSelectedOptions('drink', selectedOptions);
  return groups.map(group => ({
    ...group,
    options: group.values.map(value => ({
      value,
      selected: group.multiple
        ? canonical.toppings.includes(value)
        : canonical[group.key] === value,
    })),
  }));
}

function initializeDrinkSelection(dish = {}, initialOptions = {}) {
  const supported = getSupportedDrinkOptions(dish);
  const initial = canonicalizeSelectedOptions('drink', initialOptions);
  const selected = {
    cupSize: '',
    sugarLevel: '',
    temperature: '',
    sweetener: '',
    toppings: initial.toppings.filter(value => supported.toppings.includes(value)),
  };

  SINGLE_GROUPS.forEach(group => {
    const values = supported[group.key];
    if (initial[group.key] && values.includes(initial[group.key])) {
      selected[group.key] = initial[group.key];
    } else if (values.length === 1) {
      selected[group.key] = values[0];
    }
  });

  return canonicalizeSelectedOptions('drink', selected);
}

function getMissingDrinkSelections(dish = {}, selectedOptions = {}) {
  const supported = getSupportedDrinkOptions(dish);
  const selected = canonicalizeSelectedOptions('drink', selectedOptions);
  return SINGLE_GROUPS
    .filter(group => supported[group.key].length > 0 && !supported[group.key].includes(selected[group.key]))
    .map(group => ({ key: group.key, label: group.label, message: `请选择${group.label}` }));
}

function isDrinkSelectionComplete(dish = {}, selectedOptions = {}) {
  return getMissingDrinkSelections(dish, selectedOptions).length === 0;
}

function selectDrinkSingleOption(dish = {}, selectedOptions = {}, field, value) {
  const group = SINGLE_GROUPS.find(item => item.key === field);
  if (!group) return canonicalizeSelectedOptions('drink', selectedOptions);
  const supported = getSupportedDrinkOptions(dish)[field];
  const safeValue = cleanString(value);
  if (!supported.includes(safeValue)) return canonicalizeSelectedOptions('drink', selectedOptions);
  return canonicalizeSelectedOptions('drink', { ...selectedOptions, [field]: safeValue });
}

function toggleDrinkTopping(dish = {}, selectedOptions = {}, topping) {
  const supported = getSupportedDrinkOptions(dish).toppings;
  const safeTopping = cleanString(topping);
  const current = canonicalizeSelectedOptions('drink', selectedOptions);
  if (!supported.includes(safeTopping)) return current;
  const exists = current.toppings.includes(safeTopping);
  return canonicalizeSelectedOptions('drink', {
    ...current,
    toppings: exists
      ? current.toppings.filter(value => value !== safeTopping)
      : [...current.toppings, safeTopping],
  });
}

function getDrinkSelectionView(dish = {}, selectedOptions = {}) {
  const canonical = canonicalizeSelectedOptions('drink', selectedOptions);
  const missing = getMissingDrinkSelections(dish, canonical);
  return {
    selectedOptions: canonical,
    groups: getDrinkSpecGroups(dish, canonical),
    summaryText: buildSummaryText('drink', canonical),
    missing,
    canConfirm: missing.length === 0,
  };
}

function getDrinkLineAmount(price, quantity) {
  const unitPrice = normalizeUnitPrice(price);
  if (unitPrice === null) return null;
  const safeQuantity = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
  return Math.round(unitPrice * safeQuantity * 100) / 100;
}

module.exports = {
  SINGLE_GROUPS,
  getDrinkLineAmount,
  getDrinkSelectionView,
  getDrinkSpecGroups,
  getMissingDrinkSelections,
  getSupportedDrinkOptions,
  initializeDrinkSelection,
  isDrinkSelectionComplete,
  selectDrinkSingleOption,
  toggleDrinkTopping,
};
