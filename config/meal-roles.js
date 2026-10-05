const VALID_MEAL_ROLES = ['main', 'side', 'staple', 'soup', 'drink', 'dessert'];

const MEAL_ROLE_OPTIONS = [
  { value: 'main', label: '主菜' },
  { value: 'side', label: '配菜' },
  { value: 'staple', label: '主食' },
  { value: 'soup', label: '汤' },
  { value: 'dessert', label: '甜品' },
];

const MEAL_ROLE_LABELS = {
  main: '主菜',
  side: '配菜',
  staple: '主食',
  soup: '汤',
  drink: '饮品',
  dessert: '甜品',
  food: '菜品',
};

function mealRoleError(message) {
  const error = new Error(message);
  error.code = 'INVALID_MEAL_ROLES';
  return error;
}

function normalizeMealRoles(value, type, options = {}) {
  const strict = options.strict === true;
  if (strict && value !== undefined && value !== null && !Array.isArray(value)) {
    throw mealRoleError('mealRoles 必须是数组');
  }
  const source = Array.isArray(value) ? value : [];
  if (strict && source.some(item => typeof item !== 'string')) {
    throw mealRoleError('mealRoles 只能包含文本');
  }
  const cleaned = source
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
  if (strict && cleaned.some(item => !VALID_MEAL_ROLES.includes(item))) {
    throw mealRoleError('mealRoles 包含未知餐食角色');
  }
  if (type === 'drink') return ['drink'];
  if (strict && cleaned.includes('drink')) {
    throw mealRoleError('food 不能使用 drink 餐食角色');
  }
  return cleaned
    .filter(item => VALID_MEAL_ROLES.includes(item) && item !== 'drink')
    .filter((item, index, values) => values.indexOf(item) === index);
}

function mealRoleOptionViews(selected) {
  const values = Array.isArray(selected) ? selected : [];
  return MEAL_ROLE_OPTIONS.map(option => ({
    ...option,
    checked: values.includes(option.value),
  }));
}

module.exports = {
  MEAL_ROLE_LABELS,
  MEAL_ROLE_OPTIONS,
  VALID_MEAL_ROLES,
  mealRoleOptionViews,
  normalizeMealRoles,
};
