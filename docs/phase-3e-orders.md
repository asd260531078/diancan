# 阶段 3E：云端订单

## 云函数

- `familyApi`：新增 `createOrder`、`listMyOrders`、`getMyOrderDetail`、`cancelMyOrder`、`listManageOrders`、`getManageOrderDetail`、`updateOrderStatus`。
- `notifyOrder`：只接收 `orderId`，重新读取云端订单并校验当前 OpenID 是订单本人；消息失败不回滚订单。
- `uploadImage`：本阶段未修改。

## orders 建议索引

在云开发控制台的 `orders` 集合中创建：

1. `userOpenId` 升序 + `createdAt` 降序：用户订单分页查询。
2. `status` 升序 + `createdAt` 降序：管理员按状态筛选并分页。

管理员“全部订单”只按 `createdAt` 降序，使用该字段的单字段索引即可。幂等不依赖 `requestId` 查询：订单文档 ID 由 `OpenID + requestId` 的 SHA-256 摘要确定，因此无需额外创建 requestId 索引。

## 状态流转

- `pending → confirmed → preparing → completed`
- 管理员可执行：`pending/confirmed/preparing → cancelled`
- 普通用户只能执行：`pending → cancelled`
- `completed` 和 `cancelled` 都是终态。

## 真实环境验收

1. 普通用户添加一份菜品和一份饮品，提交后检查 `orders` 新文档。
2. 确认文档中的 `userOpenId` 是当前用户，价格和商品快照来自 `dishes`。
3. 用相同 `requestId` 再次调用 `createOrder`，确认仍是同一个文档 ID。
4. 管理员进入“订单管理”，依次确认、开始制作、完成。
5. 普通用户订单页下拉刷新，确认状态同步。
6. 新建 pending 订单并由用户取消；确认 confirmed 后用户取消会被拒绝。
7. 将购物车商品设为售罄后提交，确认失败且购物车保留。
8. 用非法饮品规格、非法菜品要求和伪造价格调用接口，确认云端拒绝规格或忽略伪造价格。
