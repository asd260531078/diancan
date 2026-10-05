async function claimOrderNotification(db, orderId, ownerOpenId) {
  const result = await db.collection('orders').where({
    _id: orderId,
    userOpenId: ownerOpenId,
    adminNotificationState: 'pending',
  }).update({
    data: {
      adminNotificationState: 'sending',
      adminNotificationUpdatedAt: db.serverDate(),
    },
  });
  return Boolean(result && result.stats && result.stats.updated === 1);
}

async function markOrderNotificationSent(db, orderId) {
  return db.collection('orders').doc(orderId).update({
    data: {
      adminNotificationState: 'sent',
      adminNotificationUpdatedAt: db.serverDate(),
      adminNotifiedAt: db.serverDate(),
    },
  });
}

async function resetOrderNotification(db, orderId, errorMessage = '') {
  return db.collection('orders').doc(orderId).update({
    data: {
      adminNotificationState: 'pending',
      adminNotificationUpdatedAt: db.serverDate(),
      adminNotificationLastError: String(errorMessage || '').trim().slice(0, 200),
    },
  });
}

module.exports = {
  claimOrderNotification,
  markOrderNotificationSent,
  resetOrderNotification,
};
