const cloud = require('wx-server-sdk');
const {
  claimOrderNotification,
  markOrderNotificationSent,
  resetOrderNotification,
} = require('./notification-store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const TEMPLATE_ID = 'YOUR_TEMPLATE_ID';

function cleanString(value, maxLength = 100) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

async function findAdmin() {
  for (const collectionName of ['admins', 'admin']) {
    try {
      const result = await db.collection(collectionName).where({ enabled: true }).limit(1).get();
      if (result.data[0]) return result.data[0];
      const fallback = await db.collection(collectionName).limit(1).get();
      if (fallback.data[0] && fallback.data[0].enabled !== false) return fallback.data[0];
    } catch (error) {
      // Legacy collection may not exist.
    }
  }
  return null;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = number => String(number).padStart(2, '0');
  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())} ${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

async function getOrder(orderId) {
  if (typeof orderId !== 'string') return null;
  const safeOrderId = cleanString(orderId, 100);
  if (!safeOrderId) return null;
  try {
    return (await db.collection('orders').doc(safeOrderId).get()).data || null;
  } catch (error) {
    return null;
  }
}

async function notifyNewOrder(orderId, openid) {
  const order = await getOrder(orderId);
  if (!order) return { success: false, code: 'ORDER_NOT_FOUND', message: '订单不存在' };
  if (order.userOpenId !== openid) {
    return { success: false, code: 'FORBIDDEN', message: '无权发送此订单通知' };
  }
  if (order.adminNotifiedAt || order.adminNotificationState === 'sent') {
    return { success: true, alreadyNotified: true };
  }
  const admin = await findAdmin();
  if (!admin) return { success: false, code: 'NO_ADMIN', message: '未设置管理员' };
  if (TEMPLATE_ID === 'YOUR_TEMPLATE_ID') {
    console.warn('订阅消息模板 ID 尚未配置；订单已创建，不影响正常点单');
    return { success: false, code: 'TEMPLATE_NOT_CONFIGURED', message: '订阅消息模板尚未配置' };
  }

  // 只有订单创建者能够触发通知，且同一订单只有一个并发调用能取得发送权。
  const orderDocumentId = order._id || order.id;
  const claimed = await claimOrderNotification(db, orderDocumentId, openid);
  if (!claimed) {
    return { success: true, alreadyNotified: true };
  }

  const adminOpenId = admin.openid || admin._id;
  const itemText = (Array.isArray(order.items) ? order.items : [])
    .map(item => `${item.name}×${item.quantity}`)
    .join('、')
    .slice(0, 20);
  const amountText = `¥${Number(order.totalAmount || 0)}${order.hasUnpricedItems ? '+未标价' : ''}`.slice(0, 20);
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: adminOpenId,
      page: `/pages/order-detail/order-detail?id=${encodeURIComponent(order._id || order.id)}&manage=1`,
      data: {
        phrase1: { value: '新订单' },
        date2: { value: formatDate(order.createdAt) },
        amount3: { value: amountText },
        item4: { value: itemText || '家庭点菜单' },
      },
      templateId: TEMPLATE_ID,
    });
    await markOrderNotificationSent(db, orderDocumentId);
    return { success: true, result };
  } catch (error) {
    console.error('发送新订单通知失败', { orderId: orderDocumentId, error });
    try {
      await resetOrderNotification(db, orderDocumentId, cleanString(error && error.message, 200));
    } catch (resetError) {
      console.error('回退订单通知状态失败', resetError);
    }
    return { success: false, code: 'NOTIFY_FAILED', message: '管理员提醒发送失败，不影响订单' };
  }
}

exports.main = async event => {
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) return { success: false, code: 'UNAUTHENTICATED', message: '无法识别当前微信用户' };
  if (event && (event.action === 'notifyNewOrder' || event.action === 'notify')) {
    return notifyNewOrder(event.orderId, openid);
  }
  if (event && event.action === 'getOpenid') return { success: true, openid };
  return { success: false, code: 'UNKNOWN_ACTION', message: '未知操作' };
};
