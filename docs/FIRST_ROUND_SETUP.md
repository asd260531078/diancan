# 第一轮：共享目录数据与管理员权限配置

本轮只迁移分类、菜品、用户身份和管理员权限。购物车、订单、常点统计仍保留原来的本地实现，后续模块再迁移。

## 1. 配置云环境

1. 在微信开发者工具中导入项目并填写自己的小程序 AppID。
2. 开通云开发并创建环境。
3. 将环境 ID 填入 `config/cloud.js` 的 `envId`。如果开发者工具已经设置默认环境，也可以暂时保留占位符。

## 2. 新建集合

在云开发控制台新建：

- `users`
- `admins`
- `categories`
- `dishes`

本轮客户端不直接读写这些集合，统一调用 `familyApi`。四个集合都设置自定义安全规则：

```json
{
  "read": false,
  "write": false
}
```

该规则拒绝小程序客户端绕过云函数直接访问数据库；CloudBase 服务端/云函数访问不受客户端安全规则限制。规则语义可参阅腾讯云 CloudBase 官方安全规则文档：https://cloud.tencent.com/document/product/876/41802

如果原环境已有单数形式的 `admin` 集合，可以暂时保留。代码会先检查 `admins`，再兼容检查旧 `admin`。

## 3. 部署云函数

在微信开发者工具中分别右键并选择“上传并部署：云端安装依赖”：

- `cloudfunctions/familyApi`
- `cloudfunctions/uploadImage`

`uploadImage` 直接写入当前 CloudBase 环境的云存储并返回 `cloud://` fileID，不再需要配置腾讯云 COS 密钥、Bucket 或公网域名环境变量。

云存储按用途写入 `dishes/cover`、`dishes/gallery`、`dishes/steps` 和 `drinks` 目录；文件名使用时间戳和随机字符串，不会覆盖同名图片。

## 4. 添加第一位管理员

第一次运行小程序后，`familyApi.getSession` 会在 `users` 集合创建当前用户文档，文档 ID 就是当前 OpenID。

在 `admins` 集合手动创建文档：

```json
{
  "_id": "把这里替换为 users 文档 ID",
  "openid": "把这里替换为 users 文档 ID",
  "role": "owner",
  "enabled": true
}
```

重新编译或重新进入“我的”页面后，应显示“已通过云端管理员验证”。

## 5. 图片上传安全

`uploadImage` 会重新从微信上下文取得 OpenID，并检查 `admins`/旧 `admin` 集合。普通用户即使绕过页面直接调用云函数，也会得到 `FORBIDDEN`。

此外，图片限制为 JPEG、PNG、WebP，解码后不能超过 5MB。新增和编辑接口只接受 `cloud://` fileID；`wxfile://`、本地临时路径和普通 HTTP URL 不能写入新的图片字段。

## 6. 默认分类

管理员第一次进入菜品管理页时，如果 `categories` 为空，服务端会创建：

- 主食
- 主菜
- 汤
- 饮品

这些是数据库初始化数据，不是前端硬编码的运行时分类；菜单后续始终读取 `categories` 集合。
