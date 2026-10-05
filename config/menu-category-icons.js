// 菜单导航专用的本地图标；后台 category.icon 仍保留原值。
// 尚未提供本地素材的分类继续使用数据库图标回退。
const MENU_CATEGORY_ICONS = Object.freeze({
  '热炒小菜': '/images/categories/hot-dishes.png',
  '盖饭·定食': '/images/categories/set-meals.png',
  '炒饭·焗饭': '/images/categories/fried-rice.png',
  '粉·面': '/images/categories/noodles.png',
  '汤·羹': '/images/categories/soup.png',
  '小吃·炸物': '/images/categories/snacks.png',
  '凉菜·轻食': '/images/categories/salads.png',
  '甜品·烘焙': '/images/categories/desserts.png',
  '咖啡': '/images/categories/coffee.png',
  '奶茶': '/images/categories/milk-tea.png',
  '果茶': '/images/categories/fruit-tea.png',
  '气泡饮': '/images/categories/sparkling-drinks.png',
  '奶昔·冰饮': '/images/categories/milkshakes.png',
});

function getMenuCategoryIcon(category = {}) {
  return MENU_CATEGORY_ICONS[String(category.name || '').trim()] || '';
}

module.exports = { MENU_CATEGORY_ICONS, getMenuCategoryIcon };
