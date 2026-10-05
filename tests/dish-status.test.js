const assert = require('assert');
const { canOrderDish, dishStatusView, getDishRestriction } = require('../utils/dish-status');
const serverStatus = require('../cloudfunctions/familyApi/schema');

function dish(overrides = {}) {
  return {
    type: 'food',
    enabled: true,
    availableToday: true,
    soldOut: false,
    recommended: true,
    signature: true,
    ...overrides,
  };
}

function runScenarios(type) {
  const normal = dish({ type });
  assert.strictEqual(canOrderDish(normal), true, `${type} scenario A should be orderable`);
  assert.strictEqual(serverStatus.canOrderDish(normal), true, `${type} server scenario A should be orderable`);
  assert.deepStrictEqual(getDishRestriction(normal), null);

  const unavailable = dish({ type, availableToday: false });
  assert.strictEqual(canOrderDish(unavailable), false, `${type} scenario B should be blocked`);
  assert.strictEqual(serverStatus.canOrderDish(unavailable), false, `${type} server scenario B should be blocked`);
  assert.strictEqual(dishStatusView(unavailable).restrictionText, '今天不做');

  const soldOut = dish({ type, soldOut: true });
  assert.strictEqual(canOrderDish(soldOut), false, `${type} scenario C should be blocked`);
  assert.strictEqual(serverStatus.canOrderDish(soldOut), false, `${type} server scenario C should be blocked`);
  assert.strictEqual(dishStatusView(soldOut).restrictionText, '今日售罄');

  const conflict = dish({ type, availableToday: false, soldOut: true });
  assert.strictEqual(dishStatusView(conflict).restrictionText, '今日售罄');
  assert.strictEqual(dishStatusView(conflict).restrictionKey, 'soldOut');
  assert.strictEqual(serverStatus.getDishOrderRestriction(conflict).code, 'DISH_SOLD_OUT');

  const disabled = dish({ type, enabled: false });
  assert.strictEqual(canOrderDish(disabled), false, `${type} scenario E should be blocked`);
  assert.strictEqual(serverStatus.canOrderDish(disabled), false, `${type} server scenario E should be blocked`);
  assert.strictEqual(dishStatusView(disabled).restrictionText, '已下架');

  const enabledAgain = dish({ type, enabled: true });
  assert.strictEqual(canOrderDish(enabledAgain), true, `${type} scenario F should be orderable`);
  assert.strictEqual(serverStatus.assertDishOrderable(enabledAgain), true);
}

runScenarios('food');
runScenarios('drink');

assert.strictEqual(canOrderDish({}), true, 'legacy dish without status fields should remain orderable');
assert.strictEqual(serverStatus.canOrderDish({}), true, 'legacy server dish without status fields should remain orderable');
assert.strictEqual(canOrderDish({ enabled: true, availableToday: true, soldOut: false }), true);
assert.strictEqual(canOrderDish({ enabled: true, availableToday: false, soldOut: false }), false);
assert.strictEqual(canOrderDish({ enabled: true, availableToday: true, soldOut: true }), false);
assert.throws(
  () => serverStatus.assertDishOrderable({ enabled: true, availableToday: false, soldOut: false }),
  error => error.code === 'DISH_UNAVAILABLE_TODAY',
);
assert.throws(
  () => serverStatus.assertDishOrderable({ enabled: true, availableToday: false, soldOut: true }),
  error => error.code === 'DISH_SOLD_OUT',
);

console.log('dish-status tests passed');
