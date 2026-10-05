function uploadImage(filePath, purpose = 'dish-cover') {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: readResult => {
        wx.cloud.callFunction({
          name: 'uploadImage',
          data: {
            fileContent: readResult.data,
            fileName: filePath.split('/').pop(),
            purpose,
          },
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
      },
      fail: error => reject(error),
    });
  });
}

function isCloudFileID(value) {
  return typeof value === 'string' && value.startsWith('cloud://');
}

module.exports = {
  isCloudFileID,
  uploadImage,
};
