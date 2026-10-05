function unwrapTransactionResult(response) {
  if (response && Object.prototype.hasOwnProperty.call(response, 'result')) return response.result;
  return response;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function findExistingOrderAfterConflict(db, documentId) {
  const delays = [0, 40, 80, 160];
  for (const waitMilliseconds of delays) {
    if (waitMilliseconds > 0) await delay(waitMilliseconds);
    try {
      const existing = (await db.collection('orders').doc(documentId).get()).data;
      if (existing) return existing;
    } catch (error) {
      // 获胜事务可能仍在提交；在很短的有界窗口内继续读取。
    }
  }
  return null;
}

async function createOrderOnce(db, documentId, data) {
  if (!db || typeof db.runTransaction !== 'function') {
    const error = new Error('当前云数据库 SDK 不支持事务');
    error.code = 'TRANSACTION_UNAVAILABLE';
    throw error;
  }
  try {
    const response = await db.runTransaction(async transaction => {
      const reference = transaction.collection('orders').doc(documentId);
      let existing = null;
      try {
        existing = (await reference.get()).data || null;
      } catch (error) {
        existing = null;
      }
      if (existing) return { created: false };
      await reference.set({ data });
      return { created: true };
    }, 5);
    return unwrapTransactionResult(response) || { created: false };
  } catch (transactionError) {
    // 高并发下个别竞争者可能在事务重试耗尽后才返回；若同一确定性 ID
    // 已由获胜请求落库，则把它视为幂等成功，而不是向客户端暴露瞬时冲突。
    const existing = await findExistingOrderAfterConflict(db, documentId);
    if (existing) return { created: false };
    throw transactionError;
  }
}

async function compareAndSetOrderStatus(db, documentId, expectedStatus, patch) {
  const result = await db.collection('orders').where({
    _id: documentId,
    status: expectedStatus,
  }).update({ data: patch });
  return Boolean(result && result.stats && result.stats.updated === 1);
}

module.exports = {
  compareAndSetOrderStatus,
  createOrderOnce,
  findExistingOrderAfterConflict,
  unwrapTransactionResult,
};
