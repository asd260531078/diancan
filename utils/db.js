// 模拟数据库操作（本地存储版本）
// 如果后续需要云开发，可以替换为云数据库 API

/**
 * 初始化示例数据
 */
function initSampleData() {
  const dishes = [
    {
      id: 'D001',
      name: '红烧肉',
      price: 28,
      category: '主菜',
      description: '肥而不腻，入口即化',
      ingredients: '五花肉 500g\n冰糖 30g\n生抽 2勺\n老抽 1勺\n八角 2个',
      steps: '1. 五花肉切块，冷水下锅焯水\n2. 热锅下冰糖，小火炒至焦糖色\n3. 下五花肉翻炒上色\n4. 加生抽、老抽、八角、水\n5. 大火烧开转小火炖1小时',
      isPopular: true,
      image: '/images/default-dish.png',
      status: 'available',
      enabled: true
    },
    {
      id: 'D002',
      name: '糖醋排骨',
      price: 32,
      category: '主菜',
      description: '酸甜可口，外酥里嫩',
      ingredients: '排骨 500g\n醋 3勺\n糖 2勺\n生抽 1勺\n番茄酱 2勺',
      steps: '1. 排骨切段焯水\n2. 炸至金黄捞出\n3. 调糖醋汁\n4. 下锅翻炒均匀',
      isPopular: true,
      image: '/images/default-dish.png',
      status: 'available',
      enabled: true
    },
    {
      id: 'D003',
      name: '西红柿炒蛋',
      price: 15,
      category: '主菜',
      description: '家常美味，营养丰富',
      ingredients: '鸡蛋 3个\n西红柿 2个\n盐 适量\n糖 少许',
      steps: '1. 鸡蛋打散炒熟盛出\n2. 西红柿切块炒出汁\n3. 加盐、糖调味\n4. 下鸡蛋翻炒均匀',
      isPopular: false,
      image: '/images/default-dish.png',
      status: 'available',
      enabled: true
    },
    {
      id: 'D004',
      name: '紫菜蛋花汤',
      price: 10,
      category: '汤',
      description: '清淡鲜美，简单易做',
      ingredients: '紫菜 10g\n鸡蛋 2个\n盐 适量\n葱花 少许',
      steps: '1. 水烧开\n2. 紫菜洗净放入\n3. 蛋液慢慢淋入\n4. 加盐调味，撒葱花',
      isPopular: false,
      image: '/images/default-dish.png',
      status: 'available',
      enabled: true
    }
  ];

  wx.setStorageSync('dishes', dishes);
  return dishes;
}

/**
 * 获取菜品列表
 */
function getDishes() {
  let dishes = wx.getStorageSync('dishes');
  if (!dishes || dishes.length === 0) {
    dishes = initSampleData();
  }
  return dishes;
}

module.exports = {
  initSampleData,
  getDishes,
};
