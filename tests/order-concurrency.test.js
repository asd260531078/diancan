const assert = require('assert');
const {
  compareAndSetOrderStatus,
  createOrderOnce,
} = require('../cloudfunctions/familyApi/order-store');

function createFakeDatabase() {
  const documents = new Map();
  let transactionTail = Promise.resolve();
  const collection = () => ({
    doc: id => ({
      async get() {
        if (!documents.has(id)) throw new Error('document not found');
        return { data: documents.get(id) };
      },
      async set({ data }) {
        documents.set(id, { ...data, _id: id });
        return { stats: { created: 1 } };
      },
    }),
    where: condition => ({
      async update({ data }) {
        const current = documents.get(condition._id);
        if (!current || current.status !== condition.status) return { stats: { updated: 0 } };
        documents.set(condition._id, { ...current, ...data });
        return { stats: { updated: 1 } };
      },
    }),
  });
  return {
    documents,
    collection,
    runTransaction(callback) {
      let release;
      const previous = transactionTail;
      transactionTail = new Promise(resolve => { release = resolve; });
      return previous.then(async () => {
        try {
          return { result: await callback({ collection }) };
        } finally {
          release();
        }
      });
    },
  };
}

(async () => {
  const createDb = createFakeDatabase();
  const results = await Promise.all(new Array(20).fill(null).map((_, index) => createOrderOnce(
    createDb,
    'ord_same',
    { id: 'ord_same', requestNumber: index, status: 'pending' },
  )));
  assert.strictEqual(results.filter(item => item.created).length, 1);
  assert.strictEqual(createDb.documents.size, 1);
  assert.strictEqual(createDb.documents.get('ord_same').requestNumber, 0);

  const fallbackDocument = { _id: 'ord_fallback', status: 'pending' };
  const fallbackDb = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { data: fallbackDocument };
            },
          };
        },
      };
    },
    async runTransaction() {
      throw new Error('transaction conflict retries exhausted');
    },
  };
  assert.deepStrictEqual(
    await createOrderOnce(fallbackDb, 'ord_fallback', fallbackDocument),
    { created: false },
  );

  let delayedReadCount = 0;
  const delayedFallbackDb = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              delayedReadCount += 1;
              if (delayedReadCount < 3) throw new Error('document not visible yet');
              return { data: fallbackDocument };
            },
          };
        },
      };
    },
    async runTransaction() {
      throw new Error('transaction conflict retries exhausted');
    },
  };
  assert.deepStrictEqual(
    await createOrderOnce(delayedFallbackDb, 'ord_fallback', fallbackDocument),
    { created: false },
  );
  assert.strictEqual(delayedReadCount, 3);

  const failedDb = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              throw new Error('document not found');
            },
          };
        },
      };
    },
    async runTransaction() {
      throw new Error('transaction unavailable');
    },
  };
  await assert.rejects(
    () => createOrderOnce(failedDb, 'ord_missing', fallbackDocument),
    /transaction unavailable/,
  );

  const statusDb = createFakeDatabase();
  statusDb.documents.set('ord_status', { _id: 'ord_status', status: 'pending' });
  const statusResults = await Promise.all([
    compareAndSetOrderStatus(statusDb, 'ord_status', 'pending', { status: 'confirmed', confirmedAt: 't1' }),
    compareAndSetOrderStatus(statusDb, 'ord_status', 'pending', { status: 'cancelled', cancelledAt: 't2' }),
  ]);
  assert.strictEqual(statusResults.filter(Boolean).length, 1);
  const finalOrder = statusDb.documents.get('ord_status');
  assert.ok(['confirmed', 'cancelled'].includes(finalOrder.status));
  assert.strictEqual(Boolean(finalOrder.confirmedAt) && Boolean(finalOrder.cancelledAt), false);

  console.log('order concurrency tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
