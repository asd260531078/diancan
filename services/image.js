// 菜品图片上传前先压缩：手机原图常有 2~5MB，压到 1080px 宽后通常只有 100~300KB，
// 上传快很多，顾客浏览菜单时加载图片也快很多。
const MAX_IMAGE_WIDTH = 1080;
const COMPRESS_QUALITY = 75;
// 菜单卡片/购物车用的小图：卡片只有一百多 rpx 宽，360px 足够清晰，体积约为大图的 1/8。
const THUMB_WIDTH = 360;
const THUMB_QUALITY = 70;
const UPLOAD_CONCURRENCY = 2;

function getImageInfo(src) {
  return new Promise(resolve => {
    if (typeof wx.getImageInfo !== 'function') {
      resolve(null);
      return;
    }
    wx.getImageInfo({ src, success: resolve, fail: () => resolve(null) });
  });
}

function compressImage(filePath, settings = {}) {
  const maxWidth = settings.maxWidth || MAX_IMAGE_WIDTH;
  const quality = settings.quality || COMPRESS_QUALITY;
  return new Promise(resolve => {
    if (typeof wx.compressImage !== 'function') {
      resolve(filePath);
      return;
    }
    getImageInfo(filePath).then(info => {
      const options = { src: filePath, quality };
      if (info && info.width > maxWidth) options.compressedWidth = maxWidth;
      // 不超宽的 PNG 保持原样（可能带透明通道）；超宽的 PNG（如手机截图）照常缩小，
      // 否则几 MB 的原图会原样上传，顾客也要下载这么大的图。分类图标走 compress: false。
      if (info && info.type === 'png' && !options.compressedWidth) {
        resolve(filePath);
        return;
      }
      wx.compressImage({
        ...options,
        success: result => resolve(result.tempFilePath || filePath),
        // 压缩失败不影响上传，直接用原图。
        fail: () => resolve(filePath),
      });
    });
  });
}

function readBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: result => resolve(result.data),
      fail: reject,
    });
  });
}

function callUpload(fileContent, fileName, purpose) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'uploadImage',
      data: { fileContent, fileName, purpose },
      timeout: 30000,
      success: response => {
        const result = response && response.result;
        if (!result || result.success !== true) {
          const error = new Error(result && result.error || '图片上传失败');
          error.code = result && result.code || 'UPLOAD_FAILED';
          reject(error);
          return;
        }
        const fileID = result.fileID;
        if (!isCloudFileID(fileID)) {
          const error = new Error('云存储未返回有效 fileID');
          error.code = 'INVALID_FILE_ID';
          reject(error);
          return;
        }
        resolve({ fileID, key: result.key || '' });
      },
      fail: error => reject(error),
    });
  });
}

// 仍经由 uploadImage 云函数上传：服务端会校验管理员身份，云存储无需开放写权限。
async function uploadImage(filePath, purpose = 'dish-cover', options = {}) {
  const source = options.compress === false ? filePath : await compressImage(filePath);
  const fileContent = await readBase64(source);
  const originalName = filePath.split('/').pop();
  const fileName = source === filePath ? originalName : `${originalName.replace(/\.[^.]*$/, '')}.jpg`;
  return callUpload(fileContent, fileName, purpose);
}

/**
 * 为主图生成并上传列表用的小图。失败时返回空串，不影响主图。
 * purpose：dish-thumb / drink-thumb。
 */
async function uploadThumbnail(filePath, purpose = 'dish-thumb') {
  try {
    const source = await compressImage(filePath, { maxWidth: THUMB_WIDTH, quality: THUMB_QUALITY });
    // 压缩失败（返回原图）时不上传，避免“小图”和大图一样大。
    if (source === filePath) return '';
    const fileContent = await readBase64(source);
    const fileName = `${filePath.split('/').pop().replace(/\.[^.]*$/, '')}-thumb.jpg`;
    const result = await callUpload(fileContent, fileName, purpose);
    return result.fileID;
  } catch (error) {
    console.warn('缩略图生成失败，菜单将使用主图', error);
    return '';
  }
}

/** 为已在云存储里的主图补一张小图（管理端批量补旧菜品用）。失败时返回空串。 */
async function uploadThumbnailForCloudFile(fileID, purpose = 'dish-thumb') {
  if (!isCloudFileID(fileID)) return '';
  try {
    const downloaded = await wx.cloud.downloadFile({ fileID });
    if (!downloaded || !downloaded.tempFilePath) return '';
    return uploadThumbnail(downloaded.tempFilePath, purpose);
  } catch (error) {
    console.warn('下载主图失败，无法生成缩略图', fileID, error);
    return '';
  }
}

/** 多张图片并发上传（最多 2 张同时），按原顺序返回；onProgress(done, total)。 */
async function uploadImages(filePaths = [], purpose = 'dish-gallery', options = {}) {
  const results = new Array(filePaths.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < filePaths.length) {
      const index = next;
      next += 1;
      results[index] = await uploadImage(filePaths[index], purpose, options);
      done += 1;
      if (typeof options.onProgress === 'function') options.onProgress(done, filePaths.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, filePaths.length) }, worker));
  return results;
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

module.exports = {
  compressImage,
  isCloudFileID,
  uploadImage,
  uploadThumbnail,
  uploadThumbnailForCloudFile,
  uploadImages,
};
