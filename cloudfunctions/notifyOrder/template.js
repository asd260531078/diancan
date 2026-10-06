// 与小程序端 config/notify.js 中的 newOrderTemplateId 保持一致。
// 也可以在云开发控制台给本云函数设置环境变量 NEW_ORDER_TEMPLATE_ID。
// 模板字段（phrase1/date2/amount3/item4）需与所选模板一致，见 docs/PERFORMANCE_AND_DEPLOY.md。
module.exports = {
  NEW_ORDER_TEMPLATE_ID: process.env.NEW_ORDER_TEMPLATE_ID || 'YOUR_TEMPLATE_ID',
};
