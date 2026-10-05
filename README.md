# ❤️ 爱心厨房 - 微信小程序

> 给女朋友的点餐小程序：她选菜 → 你来做

## 功能特性

- 📋 **菜单浏览** - 分类展示、图文菜单、常点推荐
- 🛒 **购物车点餐** - 支持多菜品选择、备注
- 📦 **订单管理** - 状态追踪（待接单→制作中→已完成）
- 👨‍🍳 **厨师端** - 增删改菜品、管理订单
- 📖 **食谱详情** - 每道菜的食材和做法步骤
- 🔔 **微信通知** - 下单后推送通知（需配置云开发）
- ⭐ **常点推荐** - 根据历史记录自动推荐

## 快速开始

### 1. 下载微信开发者工具
下载地址：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

### 2. 克隆代码
```bash
git clone <你的仓库地址>
cd wechat-mini-program
```

### 3. 导入项目
1. 打开微信开发者工具
2. 点击「导入项目」
3. 选择本项目目录
4. 填写 AppID（没有可以先选「体验」）

### 4. 初始化云开发（可选）
如果需要微信通知功能：
1. 在微信开发者工具中开通「云开发」
2. 创建云环境
3. 替换 `app.js` 中的 `env: 'love-kitchen'` 为你的环境 ID
4. 上传 `cloudfunctions/notifyOrder` 云函数

### 5. 运行预览
点击「编译」即可在模拟器中预览

## 页面说明

| 页面 | 路径 | 说明 |
|------|------|------|
| 点餐首页 | `pages/menu/menu` | 菜单浏览 + 购物车 |
| 订单页面 | `pages/orders/orders` | 订单列表 + 状态管理 |
| 管理页面 | `pages/manage/manage` | 增删改菜品 |

## 目录结构

```
wechat-mini-program/
├── app.js              # 小程序入口
├── app.json            # 全局配置
├── app.wxss            # 全局样式
├── pages/
│   ├── menu/           # 点餐页面
│   ├── detail/         # 菜品详情/结算
│   ├── orders/         # 订单管理
│   └── manage/         # 后台管理
├── images/             # 图片资源
└── cloudfunctions/     # 云函数
```

## License

MIT

## 二次开发说明

共享菜品数据、云端管理员权限和旧数据迁移的第一轮配置见：

- `docs/FIRST_ROUND_SETUP.md`
- `docs/DATA_MIGRATION.md`
