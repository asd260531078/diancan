const TASTE_PREFERENCES = ['不辣', '少辣', '正常辣', '加辣', '清淡', '正常口味', '重口味'];

const CUSTOM_REQUEST_OPTIONS = [
  '免葱',
  '免蒜',
  '免香菜',
  '不要姜',
  '不要辣椒',
  '少油',
  '少盐',
  '少糖',
  '少酱',
  '酱汁分开',
  '饭分开',
  '汤分开',
  '不要花生',
  '不要芝麻',
];

function normalizeFoodOptionList(value, maxItems = 100) {
  return (Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim().slice(0, 50))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, maxItems);
}

module.exports = {
  CUSTOM_REQUEST_OPTIONS,
  TASTE_PREFERENCES,
  normalizeFoodOptionList,
};
