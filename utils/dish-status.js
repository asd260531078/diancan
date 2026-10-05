const STATUS = {
  DISABLED: 'disabled',
  SOLD_OUT: 'soldOut',
  UNAVAILABLE_TODAY: 'unavailableToday',
};

function getDishRestriction(dish = {}) {
  if (dish.enabled === false) {
    return { key: STATUS.DISABLED, text: '已下架', message: '该菜品已下架' };
  }
  if (dish.soldOut === true) {
    return { key: STATUS.SOLD_OUT, text: '今日售罄', message: '这道菜今日售罄' };
  }
  if (dish.availableToday === false) {
    return { key: STATUS.UNAVAILABLE_TODAY, text: '今天不做', message: '这道菜今天不做' };
  }
  return null;
}

function canOrderDish(dish = {}) {
  return dish.enabled !== false
    && dish.availableToday !== false
    && dish.soldOut !== true;
}

function dishStatusView(dish = {}) {
  const restriction = getDishRestriction(dish);
  return {
    canOrder: canOrderDish(dish),
    restrictionKey: restriction ? restriction.key : '',
    restrictionText: restriction ? restriction.text : '',
    restrictionMessage: restriction ? restriction.message : '',
  };
}

module.exports = {
  STATUS,
  canOrderDish,
  dishStatusView,
  getDishRestriction,
};
