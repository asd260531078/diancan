const CUP_SIZE_OPTIONS = ['小杯350ml', '中杯500ml', '大杯700ml'];

const LEGACY_SUGAR_LEVEL_MAP = {
  正常糖: '正常甜',
  七分糖: '七分甜',
  少糖: '少甜',
  半糖: '半甜',
  三分糖: '三分甜',
  微糖: '微甜',
  无糖: '不另外加糖',
};

const SUGAR_LEVELS = ['正常甜', '七分甜', '少甜', '半甜', '三分甜', '微甜', '不另外加糖'];

function normalizeSugarLevels(value, maxItems = 20) {
  const values = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[\n,，]/) : []);
  return values
    .map(item => String(item || '').trim().slice(0, 30))
    .filter(Boolean)
    .map(item => LEGACY_SUGAR_LEVEL_MAP[item] || item)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, maxItems);
}

const TEMPERATURE_OPTIONS = ['去冰', '少冰', '正常冰', '温', '热'];

const SWEETENER_TYPES = ['普通糖浆', '蜂蜜', '果糖', '蔗糖糖浆', '黑糖糖浆', '零卡糖'];

const TOPPING_GROUPS = [
  {
    key: 'pearls',
    name: '珍珠啵啵',
    options: [
      '黑糖珍珠', '黄金珍珠', '白玉珍珠', '琥珀珍珠', '水晶珍珠', '脆啵啵',
      '寒天晶球', '爆爆珠', '草莓爆爆珠', '芒果爆爆珠', '百香果爆爆珠', '蓝莓爆爆珠',
    ],
  },
  {
    key: 'jelly',
    name: '椰果果冻',
    options: [
      '椰果', '椰纤果', '水晶椰果', '仙草', '烧仙草', '龟苓膏', '茶冻', '红茶冻',
      '绿茶冻', '乌龙茶冻', '咖啡冻', '茉莉茶冻', '桂花冻', '果冻', '爱玉', '寒天',
    ],
  },
  {
    key: 'taro-rice',
    name: '芋圆糯米',
    options: [
      '芋圆', '小芋圆', '紫薯圆', '地瓜圆', '小丸子', '麻薯', '糯米小丸子',
      '紫米', '血糯米', '糯米', '燕麦', '青稞', '小麦胚芽',
    ],
  },
  {
    key: 'beans-grains',
    name: '豆类谷物',
    options: ['红豆', '蜜红豆', '绿豆', '花生碎', '花生仁', '薏米', '藜麦'],
  },
  {
    key: 'sago',
    name: '西米',
    options: ['西米', '大西米', '小西米'],
  },
  {
    key: 'puree',
    name: '芋泥薯泥',
    options: ['芋泥', '紫薯泥', '红薯泥', '南瓜泥'],
  },
  {
    key: 'pudding',
    name: '布丁奶冻',
    options: ['布丁', '鸡蛋布丁', '焦糖布丁', '奶冻', '椰奶冻', '双皮奶'],
  },
  {
    key: 'cream',
    name: '奶盖奶油',
    options: ['芝士奶盖', '原味奶盖', '咸芝士奶盖', '奶油顶', '淡奶油', '厚乳', '椰乳', '海盐奶盖'],
  },
  {
    key: 'fruit',
    name: '水果',
    options: [
      '芒果丁', '草莓丁', '西瓜丁', '葡萄', '青提', '橙肉', '柠檬片', '百香果',
      '火龙果', '桃肉', '菠萝丁', '荔枝', '龙眼', '芦荟',
    ],
  },
  {
    key: 'other',
    name: '其他',
    options: [
      '奥利奥碎', '饼干碎', '巧克力碎', '可可脆片', '椰蓉', '桂花', '葡萄干',
      '坚果碎', '脆麦片', '芝士碎',
    ],
  },
];

const ALL_TOPPINGS = TOPPING_GROUPS.reduce((items, group) => items.concat(group.options), []);

module.exports = {
  ALL_TOPPINGS,
  CUP_SIZE_OPTIONS,
  LEGACY_SUGAR_LEVEL_MAP,
  SUGAR_LEVELS,
  SWEETENER_TYPES,
  TEMPERATURE_OPTIONS,
  TOPPING_GROUPS,
  normalizeSugarLevels,
};
