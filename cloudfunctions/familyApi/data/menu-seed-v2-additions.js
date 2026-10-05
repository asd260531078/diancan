// 仅新增的 14 个正式商品；不包含第一批 76 个商品，也不创建/修改分类。
// 食材：名称|用量|备注；步骤：标题|说明。图片、价格由统一默认值保持为空。
const I = value => value.split('|');
const S = value => value.split('|');
const C = (name, type, items) => ({ name, type, items });

const groups = [
  C('盖饭·定食', 'food', [
    {
      name: '泰式打抛饭', description: '泰式风味罗勒肉末盖饭，蒜、辣椒与鱼露炒出咸香微辣的味道，搭配米饭和煎蛋。',
      tags: ['泰式', '下饭', '微辣', '肉末', '罗勒'], estimatedTime: '25分钟', servingSize: '1-2人', spicyLevel: 'mild', mealRoles: ['main', 'staple'],
      ingredients: [I('猪肉末|250g'), I('九层塔或泰国罗勒|1小把'), I('蒜|3瓣'), I('小米辣|1-2根'), I('洋葱|半个'), I('鱼露|10ml'), I('生抽|10ml'), I('蚝油|10ml'), I('白糖|少许'), I('食用油|适量'), I('鸡蛋|1-2个'), I('米饭|1-2碗')],
      steps: [S('备料|蒜切末，辣椒切圈，洋葱切丁，九层塔洗净沥干。'), S('爆香|锅烧热加油，下蒜末和辣椒炒香。'), S('炒肉末|加入猪肉末，大火炒散至完全变色。'), S('调味|加入鱼露、生抽、蚝油和少量白糖炒匀。'), S('炒洋葱|加入洋葱丁快速翻炒。'), S('放罗勒|临出锅加入九层塔，炒至刚变软。'), S('煎蛋|另锅把鸡蛋煎至喜欢的熟度。'), S('装盘|米饭盛盘，铺上打抛肉末和煎蛋。')],
      tips: '九层塔最后放，香气更明显；肉末大火快炒更香；不吃辣可以减少小米辣。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['免葱', '免蒜', '不要辣椒', '少油', '少盐', '不要煎蛋'],
    },
    {
      name: '咖喱猪排饭', description: '外酥里嫩的炸猪排搭配浓郁日式咖喱、土豆、胡萝卜和米饭，是饱腹的经典定食。',
      tags: ['日式', '咖喱', '猪排', '定食', '下饭'], estimatedTime: '40分钟', servingSize: '1-2人', spicyLevel: 'none', mealRoles: ['main', 'staple'],
      ingredients: [I('猪里脊排|2片'), I('盐|适量'), I('黑胡椒|少许'), I('鸡蛋|1个'), I('面粉|适量'), I('面包糠|适量'), I('食用油|适量'), I('洋葱|半个'), I('胡萝卜|半根'), I('土豆|1个'), I('日式咖喱块|适量'), I('清水|适量'), I('米饭|1-2碗')],
      steps: [S('腌猪排|猪排拍松，用盐和黑胡椒腌制。'), S('裹粉|猪排依次裹上面粉、蛋液和面包糠。'), S('切蔬菜|洋葱、胡萝卜、土豆切块。'), S('炒蔬菜|先炒香洋葱，再加入胡萝卜和土豆翻炒。'), S('炖蔬菜|加水煮至蔬菜变软。'), S('煮咖喱|关小火加入咖喱块，搅拌至浓稠。'), S('炸猪排|猪排炸至外壳金黄、内部熟透，捞出沥油。'), S('装盘|米饭装盘，淋上咖喱，放上切好的猪排。')],
      tips: '咖喱块不要大火久煮，避免糊底；猪排下锅前抖掉多余面包糠；炸好静置1-2分钟再切。',
      availableTastePreferences: ['正常', '咖喱浓一点', '咖喱淡一点'], availableCustomRequests: ['饭少一点', '饭多一点', '咖喱分开', '不要胡萝卜', '不要土豆'],
    },
  ]),
  C('粉·面', 'food', [
    {
      name: '秘制麻辣烫', description: '麻辣鲜香的家庭版麻辣烫，蔬菜、豆制品、丸滑和主食同煮，汤底浓郁、配料丰富。',
      tags: ['麻辣', '汤粉', '重口味', '暖胃'], estimatedTime: '30分钟', servingSize: '1-2人', spicyLevel: 'medium', mealRoles: ['main', 'staple'],
      ingredients: [I('火锅底料或麻辣底料|适量'), I('豆瓣酱|1勺'), I('蒜|3瓣'), I('姜|3片'), I('花椒|少许'), I('干辣椒|适量'), I('牛奶或高汤|适量'), I('清水|适量'), I('生抽|适量'), I('白糖|少许'), I('芝麻酱|适量'), I('香菜|适量'), I('葱|适量'), I('金针菇|1把'), I('青菜|1把'), I('豆腐|适量'), I('豆皮|适量'), I('丸子|适量'), I('午餐肉|适量'), I('宽粉、方便面或粉丝|1份')],
      steps: [S('处理食材|蔬菜、菌菇和配料洗净，按大小切好。'), S('炒香料|锅中放少量油，炒香姜蒜、花椒和干辣椒。'), S('炒底料|加入麻辣底料，炒出红油。'), S('加汤|加入清水或高汤，可加少量牛奶增添醇厚感。'), S('调味|加生抽和少量糖调味。'), S('先煮耐煮食材|先放丸子、豆腐等耐煮食材，煮至熟透。'), S('后煮配菜|再加入菌菇、豆皮、主食和青菜，煮熟。'), S('完成|加入芝麻酱，撒葱花和香菜即可。')],
      tips: '不同食材成熟时间不同，应分批下锅；牛奶不要大火久煮；芝麻酱最后加入更香。',
      availableTastePreferences: ['微辣', '少辣', '正常辣', '加辣', '特辣'], availableCustomRequests: ['不要香菜', '不要葱', '不要蒜', '不要花椒', '少油', '少盐', '不要芝麻酱'],
    },
  ]),
  C('热炒小菜', 'food', [
    {
      name: '擂辣椒茄子皮蛋', description: '软糯茄子搭配烧香的青椒与皮蛋，擂碎后拌入蒜香酱汁，香辣开胃。',
      tags: ['湘味', '辣', '凉拌', '下饭'], estimatedTime: '25分钟', servingSize: '2人', spicyLevel: 'medium', mealRoles: ['side'],
      ingredients: [I('茄子|2根'), I('青椒|2个'), I('皮蛋|2个'), I('蒜|3瓣'), I('生抽|适量'), I('香醋|适量'), I('盐|少许'), I('白糖|少许'), I('香油|少许'), I('辣椒油|按口味添加')],
      steps: [S('蒸茄子|茄子蒸熟或烤软。'), S('烧青椒|青椒煎烤至表皮微焦。'), S('切皮蛋|皮蛋去壳切块。'), S('调酱汁|蒜末加入生抽、香醋、盐、糖和香油调匀。'), S('合碗|将茄子、青椒和皮蛋放入大碗。'), S('擂碎|用擀杖或勺子轻轻擂碎。'), S('拌匀|加入酱汁拌匀。'), S('调辣度|按口味补充辣椒油。')],
      tips: '茄子蒸熟后稍控水；青椒烧出虎皮更香；皮蛋最后加入，避免完全捣成泥。',
      availableTastePreferences: ['少辣', '正常辣', '加辣'], availableCustomRequests: ['免蒜', '少盐', '少醋', '不要辣椒油'],
    },
    {
      name: '鲜香菇炒肉', description: '鲜香菇与嫩猪肉片大火快炒，香菇吸收肉汁后鲜味浓郁，是简单耐吃的家常菜。',
      tags: ['家常', '菌菇', '下饭'], estimatedTime: '20分钟', servingSize: '2人', spicyLevel: 'none', mealRoles: ['main', 'side'],
      ingredients: [I('鲜香菇|200g'), I('猪里脊|200g'), I('青椒|1个'), I('蒜|2瓣'), I('生抽|适量'), I('蚝油|适量'), I('料酒|少许'), I('淀粉|少许'), I('盐|适量'), I('白胡椒|少许'), I('食用油|适量')],
      steps: [S('腌肉|猪肉切片，加生抽、料酒和淀粉腌制。'), S('备菜|香菇切片，青椒切块。'), S('滑炒肉片|热锅滑炒肉片至变色后盛出。'), S('爆香|重新加少量油，炒香蒜末。'), S('炒香菇|加入香菇大火翻炒至出香味。'), S('合炒|加入青椒和肉片回锅。'), S('调味|加蚝油、生抽和少量盐。'), S('出锅|大火炒匀后出锅。')],
      tips: '鲜香菇不要泡水太久；肉片提前腌制更嫩；全程大火快炒，避免出水过多。',
      availableTastePreferences: [], availableCustomRequests: ['免蒜', '少盐'],
    },
    {
      name: '胡麻油炒鸡蛋', description: '鸡蛋用胡麻油炒制，蛋香带着浓郁芝麻坚果香，简单又适合配米饭。',
      tags: ['家常', '鸡蛋', '快手'], estimatedTime: '10分钟', servingSize: '1-2人', spicyLevel: 'none', mealRoles: ['side'],
      ingredients: [I('鸡蛋|3个'), I('胡麻油或黑芝麻油|适量'), I('葱花|少许'), I('盐|适量'), I('白胡椒|少许'), I('清水|少量')],
      steps: [S('打蛋|鸡蛋打入碗中。'), S('调蛋液|加盐、白胡椒和少量清水搅匀。'), S('热油|锅中加入胡麻油，小火稍微加热。'), S('下蛋液|倒入蛋液。'), S('推炒|底部凝固后快速推炒。'), S('控火候|炒至刚熟，保持嫩滑。'), S('出锅|撒葱花后出锅。')],
      tips: '胡麻油香气强，不宜长时间高温煎烧；蛋液加少量水更嫩；鸡蛋不要炒得过干。',
      availableTastePreferences: [], availableCustomRequests: ['不要葱', '少盐'],
    },
    {
      name: '豆角肉沫', description: '豆角切碎与猪肉末大火炒香，咸鲜微辣、粒粒分明，适合拌饭。',
      tags: ['家常', '下饭', '微辣', '肉末'], estimatedTime: '25分钟', servingSize: '2人', spicyLevel: 'mild', mealRoles: ['main', 'side'],
      ingredients: [I('豆角|300g'), I('猪肉末|180g'), I('蒜|3瓣'), I('小米辣|1-2根'), I('生抽|适量'), I('蚝油|适量'), I('料酒|少许'), I('盐|适量'), I('白糖|少许'), I('食用油|适量')],
      steps: [S('切豆角|豆角洗净切小粒。'), S('腌肉|肉末加入少量料酒腌制。'), S('炒肉末|热锅炒散肉末至微微焦香。'), S('爆香|加入蒜末和小米辣炒香。'), S('炒豆角|加入豆角粒大火翻炒。'), S('焖熟|加少量水焖至豆角完全熟透。'), S('调味|加入生抽、蚝油、盐和少量糖。'), S('收汁|大火收干水分后出锅。')],
      tips: '豆角一定要完全炒熟；肉末稍微煸香口感更好；最后收干水分更适合拌饭。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['不要蒜', '不要辣椒', '少盐'],
    },
    {
      name: '清炒时令蔬菜', description: '根据当季蔬菜灵活制作，大火清炒，突出蔬菜本身的清甜和脆嫩。',
      tags: ['时令', '清爽', '素菜'], estimatedTime: '10分钟', servingSize: '2人', spicyLevel: 'none', mealRoles: ['side'],
      ingredients: [I('时令青菜|300g'), I('蒜|2瓣'), I('盐|适量'), I('食用油|适量'), I('白糖|极少量'), I('鸡精|少许|可选')],
      steps: [S('洗菜|青菜洗净并充分沥水。'), S('分梗叶|较大的菜梗与菜叶分开。'), S('爆香|热锅冷油，炒香蒜片。'), S('炒菜梗|先放菜梗快速翻炒。'), S('炒菜叶|再加入菜叶。'), S('快炒|大火炒至断生。'), S('调味|加盐和极少量糖调味。'), S('出锅|立即出锅，保留脆嫩口感。')],
      tips: '青菜要充分沥水；全程大火快炒；不要炒太久，保持翠绿爽脆。',
      availableTastePreferences: [], availableCustomRequests: ['免蒜', '少油', '少盐'],
    },
  ]),
  C('汤·羹', 'food', [
    {
      name: '排骨玉米山药汤', description: '排骨、甜玉米和山药慢炖，汤色清亮、鲜甜温润，适合日常家庭餐。',
      tags: ['家常汤', '清甜', '慢炖'], estimatedTime: '70分钟', servingSize: '2-3人', spicyLevel: 'none', mealRoles: ['soup'],
      ingredients: [I('排骨|400g'), I('甜玉米|1根'), I('山药|200g'), I('姜|3片'), I('葱|1根'), I('料酒|少许'), I('盐|适量'), I('清水|适量'), I('枸杞|少许|可选')],
      steps: [S('焯排骨|排骨冷水下锅焯水。'), S('洗净|撇去浮沫后捞出洗净。'), S('备配料|玉米切段，山药去皮切块。'), S('起汤|排骨、姜片和清水入锅。'), S('炖排骨|大火烧开后转小火炖约40分钟。'), S('加玉米|加入玉米继续炖。'), S('加山药|加入山药，炖至软糯。'), S('调味|最后加盐，按需放枸杞。')],
      tips: '山药最后放，避免炖化；盐最后加，汤味更自然；排骨焯水后汤更清澈。',
      availableTastePreferences: [], availableCustomRequests: [],
    },
    {
      name: '乌鸡药膳汤', description: '乌鸡搭配红枣、枸杞和少量党参等食材慢炖，汤味醇厚清甜。',
      tags: ['慢炖', '家常汤', '温润'], estimatedTime: '100分钟', servingSize: '2-3人', spicyLevel: 'none', mealRoles: ['soup'],
      ingredients: [I('乌鸡|半只'), I('红枣|4颗'), I('枸杞|少许'), I('党参|少量'), I('黄芪|少量'), I('桂圆|少量'), I('姜|3片'), I('清水|适量'), I('盐|适量')],
      steps: [S('处理乌鸡|乌鸡切块并焯水。'), S('洗材料|红枣、枸杞、党参等材料简单冲洗。'), S('入锅|乌鸡、姜、党参和黄芪放入汤锅。'), S('加水|一次加足量清水。'), S('慢炖|大火烧开后转小火炖约60-90分钟。'), S('加红枣|加入红枣继续炖。'), S('加枸杞|出锅前约10分钟加入枸杞。'), S('调味|最后加盐调味。')],
      tips: '枸杞不要过早放；水最好一次加足；材料用量不宜过多，以清香为主。',
      availableTastePreferences: [], availableCustomRequests: [],
    },
  ]),
  C('果茶', 'drink', [
    {
      name: '鸭屎香手打柠檬茶', description: '鸭屎香单丛茶搭配新鲜香水柠檬，手打释放柠檬香气，茶香清幽、酸甜清爽。',
      tags: ['果茶', '柠檬', '茶香'], estimatedTime: '15分钟', servingSize: '1人', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('鸭屎香单丛茶|适量'), I('香水柠檬|半个'), I('冰块|适量'), I('糖浆|按甜度选择'), I('饮用水|适量')],
      steps: [S('泡茶|冲泡鸭屎香茶汤并冷却。'), S('切柠檬|香水柠檬洗净切片。'), S('备杯|杯中加入柠檬和冰块。'), S('手打|用捣棒轻轻手打柠檬释放香气。'), S('调甜度|按选择加入适量糖浆。'), S('倒茶|倒入冷却后的茶汤。'), S('摇匀|充分摇匀。'), S('装杯|按温度选择加冰装杯。')],
      tips: '柠檬轻打即可，避免苦味过重；茶汤充分冷却再与冰块混合。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '七分甜', '半甜', '三分甜', '微甜', '不另外加糖'],
      availableTemperatures: ['少冰', '正常冰'], availableSweetenerTypes: ['普通糖浆', '蜂蜜', '零卡糖'], availableToppings: ['椰果', '茶冻'],
    },
    {
      name: '红玉石榴', description: '鲜红石榴搭配清香茶底和少量石榴汁，酸甜清爽，石榴果香突出。',
      tags: ['果茶', '石榴', '清爽'], estimatedTime: '15分钟', servingSize: '1人', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('红石榴|半个'), I('茉莉茶或乌龙茶|适量'), I('石榴汁|少量'), I('糖浆|按甜度选择'), I('冰块|适量'), I('饮用水|适量')],
      steps: [S('泡茶|冲泡茶汤并完全冷却。'), S('剥果粒|石榴剥出果粒。'), S('压果粒|杯中放部分果粒轻轻压汁。'), S('调味|加入糖浆和少量石榴汁。'), S('加冰|加入冰块。'), S('倒茶|倒入冷却茶汤。'), S('摇匀|充分摇匀。'), S('点缀|顶部加入少量石榴果粒。')],
      tips: '保留茶底，不做成纯果汁；石榴汁少量加入，避免盖过茶香。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '七分甜', '半甜', '三分甜', '微甜', '不另外加糖'],
      availableTemperatures: ['少冰', '正常冰'], availableSweetenerTypes: ['普通糖浆'], availableToppings: ['椰果', '茶冻'],
    },
  ]),
  C('奶茶', 'drink', [
    {
      name: '青提冰奶', description: '清甜青提果肉和果酱搭配冰鲜奶，带有明显葡萄果香，口感清爽柔和。',
      tags: ['青提', '水果冰奶', '奶香'], estimatedTime: '12分钟', servingSize: '1人', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('青提|适量'), I('鲜牛奶|250ml'), I('青提果酱或自制青提果肉酱|适量'), I('炼乳|少量'), I('冰块|适量')],
      steps: [S('处理青提|青提洗净，部分去皮切碎。'), S('铺果肉|杯底放青提果肉并轻压。'), S('加果酱|加入少量青提果酱。'), S('加冰|加入冰块。'), S('倒鲜奶|倒入冰鲜奶。'), S('调甜度|按甜度选择加入少量炼乳或糖浆。'), S('搅拌|简单搅拌。'), S('点缀|顶部用青提装饰。')],
      tips: '这款是水果冰奶，不额外加入茶底；青提果酱和炼乳少量使用，避免过甜。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '半甜', '三分甜', '微甜', '不另外加糖'],
      availableTemperatures: ['少冰', '正常冰'], availableSweetenerTypes: ['炼乳', '普通糖浆', '零卡糖'], availableToppings: ['青提果肉', '脆啵啵'],
    },
  ]),
  C('奶昔·冰饮', 'drink', [
    {
      name: '奇异果奶昔', description: '新鲜奇异果搭配牛奶和酸奶搅打，果香浓郁，酸甜顺滑。',
      tags: ['奶昔', '奇异果', '果香'], estimatedTime: '10分钟', servingSize: '1人', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('奇异果|2个'), I('鲜牛奶|180ml'), I('原味酸奶|100g'), I('蜂蜜或糖浆|按甜度选择'), I('冰块|适量')],
      steps: [S('切果肉|奇异果去皮切块。'), S('留装饰|保留少量果肉备用。'), S('加奶基|搅拌机加入奇异果、牛奶和酸奶。'), S('加冰|加入冰块。'), S('调甜度|按需要加入蜂蜜或糖浆。'), S('搅打|高速搅打至细腻顺滑。'), S('装杯|倒入杯中。'), S('点缀|顶部放少量奇异果果肉。')],
      tips: '奇异果成熟度影响酸甜度，先尝味再加甜味来源；搅打后尽快饮用。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '半甜', '微甜', '不另外加糖'],
      availableTemperatures: ['正常冰'], availableSweetenerTypes: ['蜂蜜', '普通糖浆', '零卡糖'], availableToppings: ['奇异果果肉'],
    },
  ]),
];

function stableId(prefix, groupIndex, itemIndex, rowIndex) {
  return `${prefix}_menu_v2_${String(groupIndex + 1).padStart(2, '0')}_${String(itemIndex + 1).padStart(2, '0')}_${String(rowIndex + 1).padStart(2, '0')}`;
}

function getMenuSeedV2Additions() {
  return groups.map((group, groupIndex) => ({
    name: group.name,
    type: group.type,
    items: group.items.map((item, itemIndex) => ({
      ...item,
      id: `dish_menu_v2_${String(groupIndex + 1).padStart(2, '0')}_${String(itemIndex + 1).padStart(2, '0')}`,
      type: group.type,
      categoryName: group.name,
      cover: '', images: [], price: null,
      recommended: false, signature: false, availableToday: true, soldOut: false, enabled: true,
      availableTastePreferences: group.type === 'food' ? (item.availableTastePreferences || []) : [],
      availableCustomRequests: group.type === 'food' ? (item.availableCustomRequests || []) : [],
      availableCupSizes: group.type === 'drink' ? (item.availableCupSizes || []) : [],
      availableSugarLevels: group.type === 'drink' ? (item.availableSugarLevels || []) : [],
      availableTemperatures: group.type === 'drink' ? (item.availableTemperatures || []) : [],
      availableSweetenerTypes: group.type === 'drink' ? (item.availableSweetenerTypes || []) : [],
      availableToppings: group.type === 'drink' ? (item.availableToppings || []) : [],
      ingredients: item.ingredients.map((row, rowIndex) => ({
        id: stableId('ingredient', groupIndex, itemIndex, rowIndex),
        name: row[0], amount: row[1] || '', note: row[2] || '',
      })),
      steps: item.steps.map((row, rowIndex) => ({
        id: stableId('step', groupIndex, itemIndex, rowIndex),
        stepNumber: rowIndex + 1, title: row[0] || '', description: row[1], image: '',
      })),
    })),
  }));
}

module.exports = { getMenuSeedV2Additions };
