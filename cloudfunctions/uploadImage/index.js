// 管理员图片上传：保存到当前 CloudBase 环境的云存储并返回 cloud:// fileID。
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const PURPOSE_PATHS = {
  'dish-cover': 'dishes/cover',
  'dish-gallery': 'dishes/gallery',
  'dish-step': 'dishes/steps',
  'drink-cover': 'drinks/cover',
  'drink-gallery': 'drinks/gallery',
  'drink-step': 'drinks/steps',
  'meal-set-cover': 'meal-sets/cover',
  'dish-thumb': 'dishes/thumb',
  'drink-thumb': 'drinks/thumb',
};

async function isAdmin(openid) {
  for (const collectionName of ['admins', 'admin']) {
    try {
      const byId = await db.collection(collectionName).doc(openid).get();
      if (byId.data && byId.data.enabled !== false) return true;
    } catch (error) {
      // 兼容旧 admin 集合中以自动 ID 保存的文档。
    }
    try {
      const result = await db.collection(collectionName).where({ openid }).limit(1).get();
      if (result.data[0] && result.data[0].enabled !== false) return true;
    } catch (error) {
      // 初次部署时旧集合可能不存在。
    }
  }
  return false;
}

function safeExtension(fileName) {
  const requested = fileName ? String(fileName).split('.').pop().toLowerCase() : 'jpg';
  return ['jpg', 'jpeg', 'png', 'webp'].includes(requested) ? requested : 'jpg';
}

exports.main = async event => {
  try {
    const { OPENID: openid } = cloud.getWXContext();
    if (!openid || !(await isAdmin(openid))) {
      return { success: false, code: 'FORBIDDEN', error: '当前账号不是管理员，无权上传图片' };
    }

    const fileContent = event && event.fileContent;
    if (!fileContent || typeof fileContent !== 'string') {
      return { success: false, code: 'INVALID_FILE', error: '缺少图片数据' };
    }

    const buffer = Buffer.from(fileContent, 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return { success: false, code: 'INVALID_FILE', error: '图片必须小于 5MB' };
    }

    const extension = safeExtension(event && event.fileName);
    const purpose = event && PURPOSE_PATHS[event.purpose] ? event.purpose : 'dish-cover';
    const directory = PURPOSE_PATHS[purpose];
    const cloudPath = `${directory}/${openid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer,
    });
    const fileID = uploadResult && uploadResult.fileID;
    if (!fileID || !String(fileID).startsWith('cloud://')) {
      throw new Error('云存储未返回有效 fileID');
    }

    return {
      success: true,
      fileID,
      // 暂时保留 url/key 别名，兼容已部署的第一轮客户端；值仍然是 cloud:// fileID。
      url: fileID,
      key: cloudPath,
      purpose,
    };
  } catch (error) {
    console.error('云存储上传失败', error);
    return {
      success: false,
      code: error.code || 'UPLOAD_FAILED',
      error: error.message || '图片上传失败',
    };
  }
};
