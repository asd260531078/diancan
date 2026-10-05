function createCloudError(result, fallbackMessage) {
  const error = new Error((result && result.message) || fallbackMessage || '云服务调用失败');
  error.code = result && result.code || 'CLOUD_ERROR';
  error.details = result && result.details;
  return error;
}

async function callFamilyApi(action, data = {}) {
  const response = await wx.cloud.callFunction({
    name: 'familyApi',
    data: { action, ...data },
  });
  const result = response && response.result;
  if (!result || result.success !== true) {
    throw createCloudError(result, '家庭点餐服务暂时不可用');
  }
  return result.data;
}

module.exports = {
  callFamilyApi,
};
