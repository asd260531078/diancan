const assert = require('assert');
const {
  claimOrderNotification,
  markOrderNotificationSent,
  resetOrderNotification,
} = require('../cloudfunctions/notifyOrder/notification-store');

function createFakeDatabase() {
  const order = {
    _id: 'order_1',
    userOpenId: 'openid_owner',
    adminNotificationState: 'pending',
  };
  let updateTail = Promise.resolve();
  return {
    order,
    serverDate: () => 'server-date',
    collection: () => ({
      where: condition => ({
        update({ data }) {
          let release;
          const previous = updateTail;
          updateTail = new Promise(resolve => { release = resolve; });
          return previous.then(() => {
            try {
              const matches = Object.entries(condition).every(([key, value]) => order[key] === value);
              if (!matches) return { stats: { updated: 0 } };
              Object.assign(order, data);
              return { stats: { updated: 1 } };
            } finally {
              release();
            }
          });
        },
      }),
      doc: id => ({
        async update({ data }) {
          if (id !== order._id) return { stats: { updated: 0 } };
          Object.assign(order, data);
          return { stats: { updated: 1 } };
        },
      }),
    }),
  };
}

(async () => {
  const db = createFakeDatabase();
  const claims = await Promise.all(new Array(20).fill(null).map(() => (
    claimOrderNotification(db, 'order_1', 'openid_owner')
  )));
  assert.strictEqual(claims.filter(Boolean).length, 1);
  assert.strictEqual(db.order.adminNotificationState, 'sending');
  assert.strictEqual(await claimOrderNotification(db, 'order_1', 'other_user'), false);

  await resetOrderNotification(db, 'order_1', 'send failed');
  assert.strictEqual(db.order.adminNotificationState, 'pending');
  assert.strictEqual(db.order.adminNotificationLastError, 'send failed');
  assert.strictEqual(await claimOrderNotification(db, 'order_1', 'openid_owner'), true);
  await markOrderNotificationSent(db, 'order_1');
  assert.strictEqual(db.order.adminNotificationState, 'sent');
  assert.strictEqual(await claimOrderNotification(db, 'order_1', 'openid_owner'), false);

  console.log('notify concurrency tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
