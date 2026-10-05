# 阶段 3F：订单安全与并发加固

## 已落地的服务端边界

- 身份只读取 `cloud.getWXContext().OPENID`；客户端传入的 `openid`、`userOpenId`、`owner`、`role`、`isAdmin` 均不参与授权。
- `createOrder` 只接收 `requestId`、`orderNote` 和 `items[].dishId/quantity/selectedOptions`。名称、图片、类型、分类、价格、金额、状态、所有时间戳都从数据库或服务端生成。
- 订单文档 ID 为 `SHA-256(OPENID + requestId)` 的稳定摘要；事务内完成“是否存在 + 创建”，并发重放只会有一个创建者。
- 相同 `dishId + canonical selectedOptions` 的行由服务端合并；规格数组 trim、去重、稳定排序。
- 用户详情、取消使用订单 owner 校验；管理员接口每次都重新查询 `admins`。
- 状态更新使用 `_id + 旧 status` 条件更新，同一旧状态只有一个并发操作能成功。
- 新订单通知先用 `pending → sending` 条件更新取得发送权，成功标记 `sent`；失败回退 `pending`，不影响真实订单。

## 输入上限

- items：1～50 行。
- quantity：1～99 的 number 整数，不接受数字字符串。
- requestId：1～120 字符，仅字母、数字、下划线和连字符。
- orderNote：最多 200 字。
- dishId：最多 100 字。
- toppings/customRequests：最多 30 项；每项最多 80 字。
- 列表 limit：1～20；offset：0～10000。

## 数据库权限目标

当前小程序所有业务数据库访问均经 `familyApi`，客户端代码不直接调用 `wx.cloud.database()`。因此下列集合应在云开发控制台设为“仅管理端可读写”，或等价安全规则：

```json
{
  "read": false,
  "write": false
}
```

需要逐个核对：

- `orders`
- `admins`
- `users`
- `dishes`
- `categories`

这不会阻止云函数和控制台访问，但会阻止普通小程序客户端绕过 `familyApi` 直接读写。

## orders 必要索引

仅按真实查询创建两个组合索引：

1. `userOpenId` 升序 + `createdAt` 降序。
2. `status` 升序 + `createdAt` 降序。

“全部订单”只使用 `createdAt` 降序单字段索引。幂等直接命中确定性文档 ID，不查询 `requestId`，所以不需要 `userOpenId + requestId` 索引。

## 真实云环境抽查

1. 用普通用户 A 创建 pending 订单，记录订单 ID。
2. 用户 B 调用 `getMyOrderDetail` 和 `cancelMyOrder` 访问该 ID，均应返回 `FORBIDDEN`，订单不变化。
3. 用户 B 调用 `listManageOrders/getManageOrderDetail/updateOrderStatus`，均应返回 `FORBIDDEN`。
4. 用户 A 使用同一 requestId 重复提交，文档 ID 相同且 orders 只有一条；第二次返回 `idempotent: true`，不会再次触发通知。
5. 管理员尝试 `pending → preparing`、`confirmed → completed`、`completed → pending`，均应失败。
6. 正常执行 `pending → confirmed → preparing → completed`，每个状态时间戳只生成一次。
7. 分别提交 food、drink，确认价格、名称、图片和规格快照来自 `dishes`，之后修改/删除菜品也不影响旧订单详情。
8. 两台设备登录同一微信，确认订单同步；两个不同微信账号互相看不到订单，管理员能看全部。

## 部署

- 必须重新部署 `familyApi`，并选择云端安装依赖（事务依赖 `wx-server-sdk 3.0.1`）。
- 必须重新部署 `notifyOrder`。
- `uploadImage` 本阶段未修改，无需部署。

## 上线前待补真人验收

状态：**DEFERRED / 待家人朋友真机测试**。该项暂不阻塞 3G 开发，但正式上线前不能删除或误标为已通过。

- 用户 A 看不到用户 B 的订单。
- 用户 B 看不到用户 A 的订单。
- 普通用户不能调用管理员订单接口。
- 管理员能查看全部用户订单。
- 同一微信账号在不同设备能够看到一致的云端订单。
