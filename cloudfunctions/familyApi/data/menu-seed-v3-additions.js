// 仅新增的 19 个正式商品；不创建/修改分类，也不修改已存在的同名商品。
// 图片与价格统一留空；导入器按各分类当前最大 sort 依次追加。
const I = (name, amount = '', note = '') => [name, amount, note];
const S = description => ['', description];
const C = (name, type, items) => ({ name, type, items });

const groups = [
  C('热炒小菜', 'food', [
    {
      name: '麻婆豆腐', description: '嫩豆腐搭配肉末和豆瓣酱烧制，麻、辣、鲜、香兼具，酱汁浓郁，非常适合搭配米饭。',
      tags: ['川味', '麻辣', '下饭', '豆腐'], estimatedTime: '约 20 分钟', servingSize: '2 人份', spicyLevel: 'medium', mealRoles: ['main', 'side'],
      ingredients: [I('嫩豆腐'), I('猪肉末 / 牛肉末'), I('郫县豆瓣酱'), I('豆豉'), I('花椒'), I('蒜'), I('姜'), I('生抽'), I('白糖'), I('淀粉'), I('食用油'), I('葱花')],
      steps: [S('豆腐切块，用淡盐水浸泡备用。'), S('姜蒜切末，准备肉末。'), S('热锅加油，将肉末炒散炒香。'), S('加豆瓣酱、豆豉、姜蒜炒出红油。'), S('加适量清水或高汤。'), S('放入豆腐，小火烧至入味。'), S('分次加入水淀粉收浓汤汁。'), S('出锅撒花椒粉和葱花。')],
      tips: '豆腐下锅后尽量轻推，避免碎掉；水淀粉建议分两次加入；花椒粉最后放香气更明显。',
      availableTastePreferences: ['少辣', '正常辣', '加辣', '麻一点', '少麻'], availableCustomRequests: ['不要葱', '免蒜', '少油', '少盐', '少花椒'],
    },
    {
      name: '海皇粉丝啫啫煲', description: '海鲜搭配粉丝、蒜蓉和酱汁放入煲中焗香，粉丝充分吸收海鲜鲜味，锅气浓郁、鲜香入味。',
      tags: ['海鲜', '啫啫煲', '粉丝', '鲜香', '下饭'], estimatedTime: '约 30 分钟', servingSize: '2 人份', spicyLevel: 'none', mealRoles: ['main', 'side'],
      ingredients: [I('粉丝'), I('鲜虾'), I('鱿鱼 / 墨鱼'), I('扇贝肉'), I('蒜'), I('姜'), I('红葱头'), I('葱'), I('生抽'), I('蚝油'), I('料酒'), I('白糖'), I('白胡椒'), I('食用油')],
      steps: [S('粉丝提前泡软并剪成合适长度。'), S('虾和鱿鱼等海鲜处理干净。'), S('生抽、蚝油、糖、白胡椒调成酱汁。'), S('砂锅烧热，加油炒香蒜、姜和红葱头。'), S('放海鲜快速翻炒至半熟。'), S('加入粉丝并倒入调味汁。'), S('盖盖中火焗至粉丝吸收汤汁。'), S('撒葱段后关火焖片刻即可。')],
      tips: '粉丝不要泡得太软；海鲜不要焗太久，避免口感变老；砂锅必须逐渐加热，避免骤冷骤热。',
      availableTastePreferences: [], availableCustomRequests: ['不要葱', '免蒜', '不要姜', '少盐', '少油'],
    },
    {
      name: '小炒黄牛肉', description: '黄牛肉搭配香菜、辣椒和蒜苗大火快炒，牛肉嫩滑、香辣爽口，是一道经典下饭菜。',
      tags: ['湘味', '牛肉', '香辣', '下饭'], estimatedTime: '约 20 分钟', servingSize: '2 人份', spicyLevel: 'medium', mealRoles: ['main', 'side'],
      ingredients: [I('黄牛肉'), I('小米辣'), I('青椒'), I('香菜'), I('蒜苗'), I('蒜'), I('姜'), I('生抽'), I('蚝油'), I('料酒'), I('淀粉'), I('食用油')],
      steps: [S('牛肉逆纹切薄片。'), S('用生抽、料酒、淀粉和少量油腌制。'), S('青红椒、蒜苗、香菜切段。'), S('大火滑炒牛肉至刚变色后盛出。'), S('炒香姜蒜和辣椒。'), S('加入蒜苗快速翻炒。'), S('牛肉回锅，加蚝油和生抽调味。'), S('最后加入香菜快速翻匀出锅。')],
      tips: '牛肉一定逆纹切；全程大火快炒；牛肉不要久炒。',
      availableTastePreferences: ['少辣', '正常辣', '加辣', '特辣'], availableCustomRequests: ['不要香菜', '不要蒜苗', '免蒜', '少油', '少盐'],
    },
    {
      name: '香酥大鲫鱼', description: '整条鲫鱼炸至外皮金黄香酥，内部鱼肉保持鲜嫩，搭配蒜香或香辣料汁，外酥里嫩。',
      tags: ['鱼', '香酥', '炸物', '下饭'], estimatedTime: '约 40 分钟', servingSize: '2～3 人份', spicyLevel: 'mild', mealRoles: ['main'],
      ingredients: [I('鲫鱼'), I('姜'), I('葱'), I('料酒'), I('盐'), I('白胡椒'), I('淀粉'), I('食用油'), I('蒜'), I('辣椒'), I('生抽'), I('香醋'), I('白糖')],
      steps: [S('鲫鱼处理干净并擦干水分。'), S('鱼身划刀，用盐、料酒、姜葱腌制。'), S('表面薄薄拍一层淀粉。'), S('油温合适后下鱼炸制定型。'), S('中火炸熟后提高油温复炸。'), S('另锅炒香蒜末和辣椒。'), S('加生抽、醋和糖调成简单料汁。'), S('将料汁淋在炸鱼上即可。')],
      tips: '鱼表面一定擦干，避免溅油；第一遍炸熟，第二遍复炸增脆；翻鱼时动作轻，避免断裂。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['不要葱', '免蒜', '不要辣椒', '少盐'],
    },
    {
      name: '招牌下饭辣子鸡', description: '鸡块炸至外酥里嫩，搭配大量干辣椒和花椒煸炒，麻辣酥香，非常下饭。',
      tags: ['川味', '麻辣', '鸡肉', '招牌', '下饭'], estimatedTime: '约 35 分钟', servingSize: '2～3 人份', spicyLevel: 'hot', mealRoles: ['main', 'side'],
      ingredients: [I('鸡腿肉'), I('干辣椒'), I('花椒'), I('蒜'), I('姜'), I('葱'), I('生抽'), I('料酒'), I('盐'), I('白糖'), I('白芝麻'), I('淀粉'), I('食用油')],
      steps: [S('鸡腿肉切小块。'), S('加料酒、生抽、盐和少量淀粉腌制。'), S('热油将鸡块炸至金黄酥脆。'), S('捞出后升高油温复炸。'), S('锅留少量底油，炒香姜蒜和花椒。'), S('加入大量干辣椒小火炒香。'), S('鸡块回锅，加少量糖和盐翻炒。'), S('撒葱段和白芝麻出锅。')],
      tips: '辣椒要炒香但不能炒黑；鸡块切小更容易酥脆；复炸时间不要太长。',
      availableTastePreferences: ['少辣', '正常辣', '加辣', '特辣', '少麻', '正常麻', '加麻'], availableCustomRequests: ['不要葱', '免蒜', '少花椒', '少油', '少盐'],
    },
    {
      name: '干锅花菜', description: '花菜炒至微焦，搭配五花肉、辣椒和蒜苗，锅气浓郁，香辣爽脆。',
      tags: ['干锅', '花菜', '香辣', '下饭'], estimatedTime: '约 25 分钟', servingSize: '2 人份', spicyLevel: 'medium', mealRoles: ['main', 'side'],
      ingredients: [I('花菜'), I('五花肉'), I('蒜'), I('姜'), I('干辣椒'), I('青椒'), I('蒜苗'), I('豆瓣酱'), I('生抽'), I('蚝油'), I('白糖')],
      steps: [S('花菜切小朵洗净沥干。'), S('五花肉切薄片。'), S('锅中将五花肉煸出油脂。'), S('加姜蒜、辣椒和少量豆瓣酱炒香。'), S('加花菜大火翻炒。'), S('加少量生抽和蚝油。'), S('炒至花菜熟而仍保持脆感。'), S('加蒜苗翻匀出锅。')],
      tips: '花菜洗完必须充分沥水；不要炒到过软；五花肉先煸香味道更浓。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['免蒜', '不要蒜苗', '少油', '少盐', '不要辣椒'],
    },
    {
      name: '客家酿豆腐', description: '豆腐中酿入调味肉馅，煎至表面金黄后小火焖煮，豆香与肉香融合，鲜嫩入味。',
      tags: ['客家', '豆腐', '肉馅', '家常'], estimatedTime: '约 35 分钟', servingSize: '2～3 人份', spicyLevel: 'none', mealRoles: ['main', 'side'],
      ingredients: [I('老豆腐'), I('猪肉末'), I('香菇'), I('葱'), I('生抽'), I('蚝油'), I('料酒'), I('淀粉'), I('白胡椒'), I('盐'), I('食用油')],
      steps: [S('猪肉末加入香菇碎和调味料拌匀。'), S('豆腐切厚块并挖出小槽。'), S('填入肉馅并轻轻压实。'), S('锅中少油，将有肉馅的一面先煎定型。'), S('翻面继续煎至金黄。'), S('加少量水、生抽和蚝油。'), S('盖盖小火焖至肉馅熟透。'), S('最后勾薄芡并撒葱花。')],
      tips: '使用偏硬豆腐更容易操作；肉馅不要塞得过满；第一次翻面前必须煎定型。',
      availableTastePreferences: [], availableCustomRequests: ['不要葱', '少盐', '少油', '不要香菇'],
    },
    {
      name: '招牌酸菜鱼', description: '嫩滑鱼片搭配酸爽酸菜和微辣汤底，酸辣开胃，鱼肉鲜嫩，适合多人一起分享。',
      tags: ['鱼', '酸辣', '招牌', '下饭'], estimatedTime: '约 40 分钟', servingSize: '2～3 人份', spicyLevel: 'medium', mealRoles: ['main'],
      ingredients: [I('黑鱼 / 草鱼片'), I('酸菜'), I('泡椒'), I('姜'), I('蒜'), I('葱'), I('蛋清'), I('淀粉'), I('白胡椒'), I('料酒'), I('盐'), I('花椒'), I('干辣椒'), I('高汤 / 清水')],
      steps: [S('鱼片加盐、料酒、蛋清和淀粉抓匀腌制。'), S('酸菜切段并稍微冲洗。'), S('锅中炒香姜蒜、泡椒和酸菜。'), S('加高汤煮出酸菜香味。'), S('先将鱼骨或耐煮部分煮熟。'), S('转小火逐片放入鱼片。'), S('鱼片刚变白后立即关火。'), S('表面放辣椒、花椒并淋少量热油。')],
      tips: '鱼片上浆后口感更嫩；鱼片入锅后保持小火；鱼片刚变白即可关火，避免久煮。',
      availableTastePreferences: ['少辣', '正常辣', '加辣', '少酸', '正常酸', '加酸'], availableCustomRequests: ['不要葱', '免蒜', '少花椒', '不要泡椒', '少油'],
    },
    {
      name: '清蒸大闸蟹', description: '大闸蟹采用最简单的清蒸方式，突出蟹肉本身鲜甜，搭配姜醋汁食用。',
      tags: ['螃蟹', '清蒸', '海鲜', '鲜味'], estimatedTime: '约 25 分钟', servingSize: '1～2 人份', spicyLevel: 'none', mealRoles: ['main'],
      ingredients: [I('大闸蟹'), I('姜'), I('葱'), I('料酒'), I('香醋'), I('生抽'), I('白糖')],
      steps: [S('大闸蟹刷洗干净。'), S('姜切片铺在蒸屉上。'), S('大闸蟹腹部朝上摆放。'), S('水烧开后上锅蒸。'), S('根据蟹大小蒸约 15～20 分钟。'), S('姜末加入香醋、少量生抽和糖调成蘸汁。'), S('蒸好后稍微焖 2 分钟。'), S('搭配姜醋汁食用。')],
      tips: '螃蟹必须充分蒸熟；蒸制时间按实际大小调整；腹部朝上可以减少蟹黄流失。',
      availableTastePreferences: [], availableCustomRequests: [],
    },
    {
      name: '干锅土豆虾', description: '鲜虾搭配外焦内软的土豆条，以香辣干锅方式炒制，鲜香浓郁、口感丰富。',
      tags: ['干锅', '鲜虾', '土豆', '香辣'], estimatedTime: '约 35 分钟', servingSize: '2～3 人份', spicyLevel: 'medium', mealRoles: ['main', 'side'],
      ingredients: [I('鲜虾'), I('土豆'), I('洋葱'), I('青红椒'), I('蒜'), I('姜'), I('干辣椒'), I('花椒'), I('豆瓣酱'), I('生抽'), I('白糖'), I('白芝麻')],
      steps: [S('鲜虾处理干净，土豆切条。'), S('土豆炸或煎至表面金黄。'), S('鲜虾煎至变色并略微焦香。'), S('锅中炒香姜蒜、花椒和干辣椒。'), S('加少量豆瓣酱炒出香味。'), S('加洋葱和青红椒。'), S('放入土豆和虾翻炒。'), S('加生抽、糖调味，撒芝麻出锅。')],
      tips: '鲜虾处理后充分沥干；土豆先煎至定型再合炒；调味料有咸味，盐需谨慎添加。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['免蒜', '少花椒', '不要辣椒', '少油', '少盐'],
    },
    {
      name: '干锅手撕包菜', description: '包菜手撕后搭配五花肉和干辣椒大火爆炒，脆嫩微焦，锅气十足。',
      tags: ['干锅', '包菜', '香辣', '家常'], estimatedTime: '约 20 分钟', servingSize: '2 人份', spicyLevel: 'medium', mealRoles: ['side'],
      ingredients: [I('包菜'), I('五花肉'), I('干辣椒'), I('蒜'), I('生抽'), I('蚝油'), I('香醋'), I('盐'), I('白糖')],
      steps: [S('包菜手撕成大片并洗净沥水。'), S('五花肉切薄片。'), S('锅中煸香五花肉。'), S('加蒜和干辣椒炒香。'), S('放包菜大火快速翻炒。'), S('加生抽、蚝油和少量糖。'), S('沿锅边淋少量香醋。'), S('炒至断生马上出锅。')],
      tips: '包菜必须充分沥水；全程大火快炒；断生后立即出锅，保持脆嫩。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['免蒜', '少油', '少盐', '不要辣椒'],
    },
    {
      name: '菠萝咕咾肉', description: '炸至酥香的猪肉搭配酸甜番茄汁和菠萝，酸甜开胃，外酥内嫩。',
      tags: ['粤式', '酸甜', '猪肉', '菠萝'], estimatedTime: '约 35 分钟', servingSize: '2 人份', spicyLevel: 'none', mealRoles: ['main', 'side'],
      ingredients: [I('猪里脊'), I('菠萝'), I('青椒'), I('红椒'), I('鸡蛋'), I('淀粉'), I('番茄酱'), I('白醋'), I('白糖'), I('盐'), I('食用油')],
      steps: [S('猪肉切块，加盐和鸡蛋腌制。'), S('裹上淀粉。'), S('下油锅炸至金黄。'), S('提高油温快速复炸。'), S('菠萝、青红椒切块。'), S('番茄酱、糖、醋调成酸甜汁。'), S('酱汁煮至略浓后加入菠萝和青红椒。'), S('倒入炸肉快速裹汁立即出锅。')],
      tips: '炸肉复炸后更酥；肉下锅前不要裹太厚淀粉；最后裹汁要快，避免外皮回软。',
      availableTastePreferences: [], availableCustomRequests: ['少糖', '少酸', '少盐'],
    },
  ]),
  C('凉菜·轻食', 'food', [
    {
      name: '泰式捞汁三文鱼', description: '三文鱼搭配青柠、香菜、小米辣和泰式酸辣捞汁，口感清爽，酸辣鲜香。',
      tags: ['泰式', '三文鱼', '凉菜', '酸辣', '清爽'], estimatedTime: '约 20 分钟', servingSize: '1～2 人份', spicyLevel: 'mild', mealRoles: ['side'],
      ingredients: [I('可生食级三文鱼'), I('青柠'), I('小米辣'), I('蒜'), I('香菜'), I('洋葱'), I('鱼露'), I('生抽'), I('白糖'), I('柠檬汁'), I('芝麻')],
      steps: [S('确认使用适合直接食用的三文鱼。'), S('三文鱼切厚片或小块并保持低温。'), S('洋葱切丝，小米辣切圈。'), S('青柠汁、鱼露、生抽和糖调成捞汁。'), S('加入蒜末和辣椒。'), S('三文鱼与洋葱装盘。'), S('食用前淋入捞汁。'), S('撒香菜和芝麻即可。')],
      tips: '必须使用适合生食的三文鱼并全程低温保存；捞汁建议食用前再加；青柠汁不要提前长时间浸泡鱼肉。',
      availableTastePreferences: ['不辣', '少辣', '正常辣', '加辣'], availableCustomRequests: ['不要香菜', '免蒜', '不要洋葱', '少辣', '少酸'],
    },
  ]),
  C('汤·羹', 'food', [
    {
      name: '冬阴功海鲜汤', description: '泰式经典酸辣海鲜汤，以香茅、南姜、柠檬叶和鲜虾煮出浓郁香气，酸辣鲜爽。',
      tags: ['泰式', '海鲜', '酸辣', '汤'], estimatedTime: '约 30 分钟', servingSize: '2～3 人份', spicyLevel: 'medium', mealRoles: ['soup'],
      ingredients: [I('鲜虾'), I('鱿鱼'), I('蛤蜊'), I('香茅'), I('南姜'), I('柠檬叶'), I('小米辣'), I('番茄'), I('蘑菇'), I('鱼露'), I('青柠汁'), I('椰奶'), I('冬阴功酱'), I('清水 / 高汤')],
      steps: [S('海鲜处理干净。'), S('香茅拍裂，南姜切片。'), S('高汤中加入香茅、南姜和柠檬叶煮香。'), S('加番茄、蘑菇和冬阴功酱。'), S('加入鲜虾、鱿鱼和蛤蜊。'), S('海鲜煮熟后加鱼露。'), S('转小火加入适量椰奶。'), S('关火后加入青柠汁调节酸味。')],
      tips: '青柠汁最后放，香气更清新；海鲜不要久煮；椰奶加入后不要持续猛烈沸腾。',
      availableTastePreferences: ['少辣', '正常辣', '加辣', '少酸', '正常酸', '加酸'], availableCustomRequests: ['少盐', '少油'],
    },
  ]),
  C('粉·面', 'food', [
    {
      name: '潮汕牛肉粿条', description: '潮汕风味牛肉粿条，以清鲜牛肉汤搭配嫩牛肉、粿条和芹菜，汤清肉嫩，味道鲜甜。',
      tags: ['潮汕', '牛肉', '粿条', '汤粉'], estimatedTime: '约 25 分钟', servingSize: '1 人份', spicyLevel: 'none', mealRoles: ['main', 'staple'],
      ingredients: [I('粿条'), I('嫩牛肉'), I('牛肉高汤'), I('芹菜'), I('葱'), I('香菜'), I('蒜酥'), I('鱼露'), I('盐'), I('白胡椒'), I('食用油')],
      steps: [S('牛肉逆纹切薄片。'), S('芹菜、葱和香菜切碎。'), S('牛肉汤烧开并调好基础味。'), S('粿条快速烫热后装碗。'), S('牛肉片用沸汤快速烫至刚熟。'), S('牛肉放在粿条上。'), S('冲入热牛肉汤。'), S('撒芹菜、葱花、香菜和蒜酥。')],
      tips: '牛肉不要久煮；粿条只需快速烫热；汤底保持清鲜，不要调得过重。',
      availableTastePreferences: [], availableCustomRequests: ['不要葱', '不要香菜', '不要芹菜', '不要蒜酥', '少盐'],
    },
    {
      name: '港式云吞竹升面', description: '爽脆竹升面搭配鲜虾云吞和清鲜汤底，面条弹牙、云吞鲜甜，是经典港式汤面。',
      tags: ['港式', '云吞', '竹升面', '汤面'], estimatedTime: '约 30 分钟', servingSize: '1 人份', spicyLevel: 'none', mealRoles: ['main', 'staple'],
      ingredients: [I('竹升面'), I('鲜虾'), I('猪肉末'), I('云吞皮'), I('高汤'), I('生抽'), I('盐'), I('白胡椒'), I('香油'), I('韭黄 / 葱')],
      steps: [S('鲜虾切粒，与猪肉末调味做成云吞馅。'), S('用云吞皮包好云吞。'), S('高汤烧开并调味。'), S('云吞下锅煮熟。'), S('另锅将竹升面煮至刚熟。'), S('面条沥水装碗。'), S('加入云吞。'), S('冲入热汤并撒韭黄或葱。')],
      tips: '竹升面不要煮太软；云吞馅不要搅得过度；面与云吞最好分开煮，汤更清。',
      availableTastePreferences: [], availableCustomRequests: ['不要葱', '不要韭黄', '少盐'],
    },
  ]),
  C('奶昔·冰饮', 'drink', [
    {
      name: '西瓜椰椰', description: '新鲜西瓜搭配清香椰乳，口感清甜顺滑，适合冰饮。',
      tags: ['西瓜', '椰乳', '水果冰饮'], estimatedTime: '约 10 分钟', servingSize: '1 人份', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('西瓜'), I('椰乳 / 椰奶'), I('椰子水'), I('冰块'), I('糖浆', '', '可选')],
      steps: [S('西瓜去皮去籽切块。'), S('部分西瓜放入搅拌机。'), S('加椰子水和冰块打成西瓜冰沙。'), S('杯底或杯壁加入适量椰乳。'), S('倒入西瓜冰沙。'), S('根据需要补少量糖浆。'), S('轻轻做出分层效果。'), S('顶部放少量西瓜丁。')],
      tips: '西瓜甜度足够时可不额外加糖；搅打后尽快饮用；椰乳缓慢倒入更容易形成分层。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '半甜', '微甜', '不另外加糖'], availableTemperatures: ['正常冰'], availableSweetenerTypes: ['普通糖浆', '零卡糖'], availableToppings: ['西瓜果肉', '椰果', '脆啵啵'],
    },
  ]),
  C('奶茶', 'drink', [
    {
      name: '黑糖珍珠鲜牛乳', description: 'Q弹黑糖珍珠搭配冰鲜牛乳，杯壁挂上浓郁黑糖浆，奶香与焦糖香明显。',
      tags: ['黑糖', '珍珠', '鲜牛乳'], estimatedTime: '约 15 分钟', servingSize: '1 人份', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('鲜牛奶'), I('黑糖珍珠'), I('黑糖'), I('清水'), I('冰块')],
      steps: [S('珍珠煮熟后焖至软Q。'), S('黑糖加少量水煮成浓稠黑糖浆。'), S('将珍珠倒入黑糖浆中小火翻煮。'), S('杯壁挂适量黑糖浆。'), S('加入黑糖珍珠。'), S('加冰块。'), S('倒入冰鲜牛奶。'), S('饮用前搅匀。')],
      tips: '珍珠建议现煮现用；黑糖浆不要熬焦；热饮版本不要加冰。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '半甜', '微甜'], availableTemperatures: ['去冰', '少冰', '正常冰', '温', '热'], availableSweetenerTypes: ['黑糖'], availableToppings: ['黑糖珍珠', '珍珠', '布丁'],
    },
  ]),
  C('果茶', 'drink', [
    {
      name: '椰青柠檬茶', description: '清甜椰青水搭配香水柠檬和清香茶底，椰香自然、柠檬清爽，整体酸甜轻盈。',
      tags: ['果茶', '椰青', '柠檬', '清爽'], estimatedTime: '约 15 分钟', servingSize: '1 人份', spicyLevel: 'none', mealRoles: ['drink'],
      ingredients: [I('椰青水'), I('香水柠檬'), I('茉莉茶 / 乌龙茶'), I('冰块'), I('糖浆'), I('椰青果肉', '', '可选')],
      steps: [S('冲泡茶汤并冷却。'), S('香水柠檬洗净切片。'), S('杯中加入柠檬和冰块。'), S('轻轻手打柠檬释放香气。'), S('加入适量糖浆。'), S('倒入椰青水。'), S('加入冷却茶汤并摇匀。'), S('顶部按需加入少量椰青果肉。')],
      tips: '柠檬轻打即可，避免苦味过重；茶汤冷却后再与冰块混合；椰青果肉按需添加。',
      availableCupSizes: ['中杯500ml', '大杯700ml'], availableSugarLevels: ['正常甜', '七分甜', '半甜', '三分甜', '微甜', '不另外加糖'], availableTemperatures: ['少冰', '正常冰'], availableSweetenerTypes: ['普通糖浆', '蜂蜜', '零卡糖'], availableToppings: ['椰果', '茶冻', '椰青果肉'],
    },
  ]),
];

function stableId(prefix, groupIndex, itemIndex, rowIndex) {
  return `${prefix}_menu_v3_${String(groupIndex + 1).padStart(2, '0')}_${String(itemIndex + 1).padStart(2, '0')}_${String(rowIndex + 1).padStart(2, '0')}`;
}

function getMenuSeedV3Additions() {
  return groups.map((group, groupIndex) => ({
    name: group.name,
    type: group.type,
    items: group.items.map((item, itemIndex) => ({
      ...item,
      id: `dish_menu_v3_${String(groupIndex + 1).padStart(2, '0')}_${String(itemIndex + 1).padStart(2, '0')}`,
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

module.exports = { getMenuSeedV3Additions };
