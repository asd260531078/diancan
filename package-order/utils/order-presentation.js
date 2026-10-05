const { formatMoney } = require('../../utils/money');

const ORDER_STATUS_TEXT = {
  pending: '待确认',
  confirmed: '已确认',
  preparing: '制作中',
  completed: '已完成',
  cancelled: '已取消',
};

function normalizeStatus(value, legacy = false) {
  if (legacy && value === 'accepted') return 'preparing';
  return ORDER_STATUS_TEXT[value] ? value : 'pending';
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
    if (Number.isFinite(value._seconds)) return new Date(value._seconds * 1000);
    if (Number.isFinite(value.$date)) return new Date(value.$date);
  }
  return null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatOrderTime(value) {
  const date = dateValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeOrderItem(raw = {}, index = 0) {
  const quantity = Math.max(1, Number(raw.quantity || raw.num) || 1);
  const unitPrice = raw.unitPrice === null || raw.unitPrice === undefined
    ? (raw.price === null || raw.price === undefined ? null : Number(raw.price))
    : Number(raw.unitPrice);
  const lineAmount = raw.lineAmount === null || raw.lineAmount === undefined
    ? (unitPrice === null ? null : unitPrice * quantity)
    : Number(raw.lineAmount);
  return {
    ...raw,
    orderItemId: raw.orderItemId || `item_${index + 1}`,
    dishId: raw.dishId || raw.id || '',
    name: raw.name || '未命名商品',
    cover: raw.cover || raw.image || '',
    quantity,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
    unitPriceText: Number.isFinite(unitPrice) ? formatMoney(unitPrice) : '',
    lineAmount: Number.isFinite(lineAmount) ? lineAmount : null,
    lineAmountText: Number.isFinite(lineAmount) ? formatMoney(lineAmount) : '',
    summaryText: String(raw.summaryText || ''),
  };
}

function normalizeOrder(raw = {}, options = {}) {
  const legacy = options.legacy === true;
  const status = normalizeStatus(raw.status, legacy);
  const items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeOrderItem);
  const itemCount = Number(raw.itemCount)
    || items.reduce((total, item) => total + item.quantity, 0);
  const totalAmountValue = raw.totalAmount !== undefined ? raw.totalAmount : raw.totalPrice;
  const totalAmount = Number.isFinite(Number(totalAmountValue)) ? Number(totalAmountValue) : 0;
  return {
    ...raw,
    id: raw.id || raw._id || '',
    orderNo: raw.orderNo || raw.id || raw._id || '本机旧订单',
    status,
    statusText: ORDER_STATUS_TEXT[status],
    items,
    itemCount,
    totalAmount,
    totalAmountText: formatMoney(totalAmount),
    hasUnpricedItems: raw.hasUnpricedItems === true || items.some(item => item.unitPrice === null),
    orderNote: raw.orderNote || raw.note || '',
    createdAtText: formatOrderTime(raw.createdAt || raw.createTime),
    confirmedAtText: formatOrderTime(raw.confirmedAt),
    preparingAtText: formatOrderTime(raw.preparingAt),
    completedAtText: formatOrderTime(raw.completedAt),
    cancelledAtText: formatOrderTime(raw.cancelledAt),
    legacyLocal: legacy,
  };
}

function normalizeLegacyOrders(rawOrders) {
  return (Array.isArray(rawOrders) ? rawOrders : []).map(order => normalizeOrder(order, { legacy: true }));
}

module.exports = {
  ORDER_STATUS_TEXT,
  formatOrderTime,
  normalizeLegacyOrders,
  normalizeOrder,
  normalizeOrderItem,
  normalizeStatus,
};
