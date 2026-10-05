# 正式菜单 V1 手工导入

本次只准备代码，不会自动写云数据库。先在微信开发者工具手动部署 `cloudfunctions/familyApi`（建议“上传并部署：云端安装依赖”），确认当前微信账号已在 `admins` 且 `getSession` 返回 `isAdmin: true`。

在小程序环境的 Console 手动执行只读预览：

```js
wx.cloud.callFunction({
  name: 'familyApi',
  data: { action: 'seedMenuCatalog', dryRun: true },
}).then(({ result }) => console.log('菜单导入预览', result));
```

先核对 `result.success === true`、`result.data.blocked === false`、`conflicts` 为空以及 14 个目标分类 / 76 个目标商品。预览会检查现有云数据库；无法从本地代码推断云端已有多少项。已有同名分类的显式 `type` 若与目标不同，或已有重复的同分类同名商品，会显示冲突并阻止正式导入，不能直接覆盖。

确认后手动执行正式导入（默认每次最多写 20 项，避免云函数超时）：

```js
wx.cloud.callFunction({
  name: 'familyApi',
  data: { action: 'seedMenuCatalog', dryRun: false },
}).then(({ result }) => console.log('菜单导入结果', result));
```

检查 `failures` 为空；若 `needsAnotherRun === true`，重复执行上面同一调用，直到为 `false`。每次都会重新查询云数据库、复用已有记录；中断后可安全重试。也可指定 `maxWrites: 1..30`，减小单次处理量。最终再执行一次 `dryRun: true`，应见 `categoriesToCreate: 0`、`dishesToCreate: 0`、`recipesToBackfill: 0`。如果有已有管理员配置的排序或停用状态，会保留并在 `warnings` 中说明；数据库中原有的额外分类和商品也不会删除。

去重依据为同一分类 ID、同一 `type`、同一名称；旧商品无 `categoryId` 时以精确的旧分类名称匹配。新记录采用固定文档 ID，重复运行不生成新副本。已有商品只在 `ingredients`、`steps` 或 `tips` 为空且没有对应旧菜谱文本时补齐；不会改写已有图片、价格、状态或已写好的菜谱。新商品价格为 `null`、图片字段为空。分类现有 `icon`、`image`、`iconImage` 和创建时间不改写。
