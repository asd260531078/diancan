# 3G-B 固定套餐

## MealSet schema

`mealSets` 每条文档保存套餐元数据和当前菜品引用：

```js
{
  _id,
  name,
  description,
  cover,
  tags: [],
  items: [{ dishId, quantity }],
  enabled,
  recommended,
  sort,
  schemaVersion: 1,
  createdAt,
  updatedAt,
  createdBy,
  updatedBy
}
```

套餐不保存菜品名称、图片、价格或规格快照。用户读取套餐时，familyApi 一次性返回所引用的最新 dishes/categories，由客户端计算当前状态和金额。

## 权限

`createMealSet`、`updateMealSet`、`deleteMealSet`、`listManageMealSets`、`getManageMealSet` 均在云端校验管理员 OpenID。普通用户只能调用 `listMealSets` 和 `getMealSetDetail`，并且只能读取启用套餐。客户端不直接写 `mealSets`。

真实云环境中的 `mealSets` 集合还应将「数据权限」设为「仅管理端可读写」（部分控制台显示为「无权限」）。这样小程序客户端即使绕过页面也不能直接读写集合；公开读取和全部管理写入都统一经过 `familyApi`。集合权限属于控制台配置，不能用页面隐藏或前端判断替代。

## 价格与失效规则

- 套餐金额始终使用最新 `dish.price × quantity` 动态计算。
- 未标价项目不按 0 元展示，合计标记“部分商品未标价”。
- 任一菜品售罄、今天不做、下架、分类停用或已删除时，套餐仍展示但不可加入点菜单。
- 删除菜品不会自动清理套餐引用；管理页保留 dishId 并显示“商品已失效”。

## 规格和购物车

点击“就吃这套”后复用现有 food/drink 规格组件和 meal batch。所有项目配置完成后通过 `cartService.addDishes` 一次写入；任意中途取消均不会加入半套。套餐来源不写入 cart 或 orders。

## 延期验收

3F 真人多账号隔离仍为 `DEFERRED / 待家人朋友真机测试`，不标记为已通过。
