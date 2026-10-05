// 仅用于订单列表的展示文案；真实订单号、状态及订单数据保持不变。
const TITLES = [
  '好好吃饭，慢慢生活',
  '今天也要元气满满',
  '认真吃饭的每一天',
  '小小一餐，治愈今天',
  '被美食温柔接住啦',
  '今天也值得好好照顾',
  '人间烟火最抚人心',
  '吃顿喜欢的，心情发光',
  '把日子过得热气腾腾',
  '一餐一饭，都是小确幸',
  '认真生活，也认真吃饭',
  '是被美味偏爱的一天',
  '爱意藏在每一口热饭里',
  '今天的快乐从这一餐开始',
  '愿这一餐温暖你',
  '把好心情盛进碗里',
  '饭香里有家的味道',
  '好味道值得慢慢品尝',
  '平凡日子也有好滋味',
  '这一餐，刚好喜欢',
  '吃饱了再迎接明天',
  '和喜欢的人好好吃饭',
  '热乎乎的幸福已送达',
  '给今天加一点甜',
];

function orderDisplayTitle(orderNo, orderId) {
  const key = String(orderNo || orderId || '').trim();
  if (!key) return TITLES[0];
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33 + key.charCodeAt(index)) >>> 0;
  }
  return TITLES[hash % TITLES.length];
}

module.exports = { orderDisplayTitle };
