// 新订单订阅消息模板 ID（微信公众平台 → 订阅消息 → 选用模板后复制）。
// 留空时不弹订阅授权，厨师端仍可通过实时监听/轮询看到新订单。
// 云函数 cloudfunctions/notifyOrder/template.js 里需要填同一个 ID。
module.exports = {
  newOrderTemplateId: '',
};
