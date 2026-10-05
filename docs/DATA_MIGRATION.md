# dishes v2 兼容与迁移说明

## 原则

- 旧数据先兼容读取，再选择是否迁移；不会在小程序启动时自动改库。
- `listDishes` 对旧字段和缺失字段做宽容归一化，单条异常数据不会让整个菜单白屏。
- 新增、编辑仍由 `familyApi` 在云端严格校验，客户端转换只用于编辑体验，不能替代云端校验。
- 迁移使用管理员接口 `migrateDishesV2`，默认是 `dryRun` 预演。
- 迁移只补齐规范字段并设置 `schemaVersion: 2`，不会删除旧字段或未知业务字段。
- 已是 `schemaVersion >= 2` 的文档会跳过，所以真实迁移可安全重复执行。

## 旧字段到 v2 字段映射

| 旧字段/类型 | v2 字段/类型 | 兼容方式 |
|---|---|---|
| `id` / `_id` | `id` / 云文档 `_id` | 原地迁移时保持文档 `_id`；本地导入尽量沿用旧 `id` |
| `image` | `cover` | 读取时继续兼容旧地址；写入时只有 `cloud://` fileID 会保留并同步到 `image`，临时路径或普通 URL 需要重新上传 |
| `category` | `categoryId` + `categoryName` | 先按 ID、再按分类名称匹配；缺少分类时真实迁移会创建兼容分类 |
| `isPopular` | `recommended` | 读取时兼容；写入仍同步保存 `isPopular` |
| 字符串 `ingredients` / `legacyIngredients` | `ingredients[]` | 每行兼容转换为 `{ id, name, amount, note }`；能明确识别的末尾用量会放入 `amount`，原兼容文本继续保存在 `legacyIngredients` |
| 字符串 `steps` / `legacySteps` | `steps[]` | 每行转换为 `{ id, stepNumber, title, description, image }`；读取按数组顺序，规范写入时重新生成连续 `stepNumber` |
| 数字 `estimatedTime` | 字符串 `estimatedTime` | `35` 或 `"35"` 转为 `"35分钟"`；已有 `"35分钟"` 原样保留 |
| 数字 `servingSize` | 字符串 `servingSize` | `2` 转为 `"2人"`，`"2-3"` 转为 `"2-3人"` |
| 数字/中文 `spicyLevel` | 枚举 `spicyLevel` | `0→none`、`1-2→mild`、`3-4→medium`、`≥5→hot`；兼容“不辣/微辣/中辣/重辣”等中文值 |
| `availableIceLevels` | `availableTemperatures` | 新字段缺失时读取旧冰量数组；新字段已存在时以新字段为准，旧字段暂不删除 |
| 缺少 `type` | `food` / `drink` | 分类名含“饮品”或“饮料”时推断为 `drink`，其他为 `food` |
| 分类 `itemType` | 分类 `type` | 读取时优先 `type`，缺失时兼容 `itemType`；新建和更新只写 canonical 字段 `type`，旧 `itemType` 暂不删除 |

## 缺省值

```js
{
  type: 'food',
  cover: '/images/default-dish.png',
  images: [],
  description: '',
  tags: [],
  price: null,
  estimatedTime: '',
  servingSize: '',
  spicyLevel: 'none',
  ingredients: [],
  steps: [],
  tips: '',
  recommended: false,
  signature: false,
  availableToday: true,
  soldOut: false,
  enabled: true,
  sort: 0,
  availableSugarLevels: [],
  availableIceLevels: [],
  availableTemperatures: [],
  availableSweetenerTypes: [],
  availableToppings: []
}
```

饮品规格数组只对 `type === 'drink'` 保留；食物会由服务端全部规范为空数组。`availableIceLevels` 仅用于兼容旧数据，新写入统一使用 `availableTemperatures`。

分类缺省补齐 `icon: ''`、`enabled: true`、`sort: 0`，并规范为 `type: food | drink | all`。能从名称明确判断时推断为 `food` 或 `drink`，无法安全判断时使用 `all`。分类不做强制批量迁移；`seedDefaultCategories` 只补默认分类的缺失字段，管理员实际编辑后会写入完整 canonical 结构。

## 迁移操作

先重新部署 `familyApi`，再由管理员账号调用：

```js
wx.cloud.callFunction({
  name: 'familyApi',
  data: { action: 'migrateDishesV2', dryRun: true }
})
```

确认返回的 `failed === 0` 并检查 `errors` 后，再执行真实迁移：

```js
wx.cloud.callFunction({
  name: 'familyApi',
  data: { action: 'migrateDishesV2', dryRun: false }
})
```

再次执行真实迁移时，已写入 `schemaVersion: 2` 的数据会进入 `skipped`，不会重复创建菜品、食材或步骤。

返回统计字段：

- `total`：扫描的云端菜品数
- `wouldMigrate`：本次符合迁移条件的数量
- `migrated`：真实更新成功数量；预演时为 0
- `skipped`：已经是 v2 的数量
- `failed` / `errors`：无法规范化的数据及原因

旧本机缓存导入仍使用 `importLegacyDishes`。它按旧 ID 去重，默认不会覆盖同 ID 云端数据；导入后直接写为 v2。

## 阶段 2D 菜谱兼容

- 不要求对现有数据执行强制批量迁移，也不会在打开编辑页时自动写数据库。
- 已有结构化数组时优先使用数组；旧文档的数组为空且存在 `legacyIngredients` / `legacySteps` 时，读取层会兼容展示旧文本。
- 管理员在新版编辑页实际保存后，`ingredients` / `steps` 写为结构化数组；兼容文本字段会同步为当前菜谱内容，避免清空菜谱后旧内容重新出现。
- 已有食材和步骤 `id` 会原样保留；缺少 ID 的旧项目会补兼容 ID，新添加项目使用时间戳和随机串 ID。
- 步骤图片只允许保存 `cloud://` fileID。替换或移除图片只更新数据库引用，当前不会自动删除旧云文件，因此可能留下孤儿文件。
