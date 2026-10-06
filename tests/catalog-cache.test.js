const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const schema = require('../utils/schema');
const storage = new Map();
let offline = false;
let legacyServer = false;
let serverVersion = 'v1';
let clock = 1000;
const calls = [];
const dish = { id: 'dish-1', name: '炒饭', cover: 'cloud://env/dish.png', enabled: true, availableToday: false };
const category = { id: 'rice', name: '米饭', type: 'food', enabled: true };
const manyDishes = Array.from({ length: 450 }, (_, index) => ({
  id: `d${index}`, name: `菜${index}`, categoryId: 'rice', type: 'food', enabled: true, price: index,
}));
let serverDishes = [dish];

function cloudError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function loadCatalog() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/catalog.js'), 'utf8'), {
    module,
    Date: { now: () => clock },
    Map,
    require(name) {
      if (name === '../utils/schema') return schema;
      assert.strictEqual(name, './cloud');
      return {
        async callFamilyApi(action, data = {}) {
          calls.push({ action, data });
          if (offline) throw new Error('offline');
          if (action === 'getCatalog') {
            if (legacyServer) throw cloudError('UNKNOWN_ACTION');
            if (data.knownVersion && data.knownVersion === serverVersion) return { version: serverVersion, notModified: true };
            return { version: serverVersion, dishes: serverDishes, categories: [category] };
          }
          if (action === 'getDishDetail') {
            if (legacyServer) throw cloudError('UNKNOWN_ACTION');
            return { item: { ...dish, steps: [{ description: '先炒蛋' }] } };
          }
          if (action === 'listDishes') return { items: [{ ...dish, steps: [{ description: '旧接口做法' }] }] };
          return { items: [category] };
        },
      };
    },
    wx: {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => {
        const text = JSON.stringify(value);
        if (text.length > 1024 * 1024) throw new Error('exceed 1MB');
        storage.set(key, JSON.parse(text));
      },
      removeStorageSync: key => storage.delete(key),
    },
    console: { warn() {} },
  });
  return module.exports;
}

async function run() {
  let catalog = loadCatalog();
  await catalog.listDishes();
  await catalog.listCategories();
  assert.strictEqual(calls.filter(call => call.action === 'getCatalog').length, 1, 'dishes and categories share one request');

  offline = true;
  catalog = loadCatalog();
  const snapshot = catalog.getCachedCatalog();
  assert.strictEqual(snapshot.dishes[0].cover, dish.cover, 'snapshot preserves the original cloud fileID');
  assert.strictEqual(snapshot.dishes[0].displayCover, undefined, 'snapshot must not persist UI/local paths');
  assert.strictEqual(snapshot.dishes[0].availableToday, false, 'compacted snapshot keeps false booleans');
  assert.strictEqual(snapshot.categories[0].id, category.id);
  assert.strictEqual((await catalog.listDishes()).source, 'cache');
  assert.strictEqual((await catalog.listCategories()).source, 'cache');
  await assert.rejects(catalog.listDishes({ allowLocalFallback: false }), /offline/);
  await assert.rejects(catalog.listCategories({ allowLocalFallback: false }), /offline/);
  await assert.rejects(catalog.listDishes({ includeDisabled: true }), /offline/);
  await assert.rejects(catalog.listCategories({ includeDisabled: true }), /offline/);
  assert.strictEqual(catalog.peekDish('dish-1').name, '炒饭', 'detail can paint from the snapshot synchronously');

  // 版本号没变：只拿到 notModified，用本地快照。
  offline = false;
  calls.length = 0;
  catalog = loadCatalog();
  const cached = await catalog.loadCatalog();
  assert.strictEqual(calls[0].data.knownVersion, 'v1');
  assert.strictEqual(cached.dishes[0].id, 'dish-1');
  assert.strictEqual(cached.source, 'cloud');
  // 60 秒内重复读取不再请求。
  await catalog.loadCatalog();
  await catalog.listDishes();
  assert.strictEqual(calls.length, 1);
  clock += 61 * 1000;
  await catalog.loadCatalog();
  assert.strictEqual(calls.length, 2);
  // 主动刷新不带版本号。
  await catalog.loadCatalog({ force: true });
  assert.strictEqual(calls[2].data.knownVersion, '');

  // 很多菜：分块保存，每块都在 1MB 内，读回完整。
  serverDishes = manyDishes;
  serverVersion = 'v2';
  catalog = loadCatalog();
  await catalog.loadCatalog({ force: true });
  assert.ok(storage.has('family_catalog_v2_dishes_2'));
  assert.ok(!storage.has('family_catalog_v2_dishes_3'));
  catalog = loadCatalog();
  assert.strictEqual(catalog.getCachedCatalog().dishes.length, 450);
  // 菜变少后旧分块被清理。
  serverDishes = [dish];
  serverVersion = 'v3';
  await catalog.loadCatalog({ force: true });
  assert.ok(!storage.has('family_catalog_v2_dishes_1'));
  catalog = loadCatalog();
  assert.strictEqual(catalog.getCachedCatalog().dishes.length, 1);

  // 详情：新接口带做法并缓存；旧云函数时退回 listDishes。
  calls.length = 0;
  let detail = await catalog.getDishDetail('dish-1');
  assert.strictEqual(detail.item.steps[0].description, '先炒蛋');
  await catalog.getDishDetail('dish-1');
  assert.strictEqual(calls.length, 1, 'detail is cached in memory');
  legacyServer = true;
  catalog = loadCatalog();
  detail = await catalog.getDishDetail('dish-1');
  assert.strictEqual(detail.item.steps[0].description, '旧接口做法');
  const legacy = await catalog.loadCatalog({ force: true });
  assert.strictEqual(legacy.dishes[0].id, 'dish-1', 'old cloud function still serves the menu');

  // 本机写菜单后内存缓存失效。
  legacyServer = false;
  calls.length = 0;
  await catalog.loadCatalog();
  await catalog.updateDish('dish-1', { name: '蛋炒饭', type: 'food', categoryId: 'rice' });
  await catalog.loadCatalog();
  assert.strictEqual(calls.filter(call => call.action === 'getCatalog').length, 1, 'write invalidates the memory cache');

  console.log('catalog cache passed: shared request, chunked snapshot, version notModified, memory TTL, detail cache, legacy fallback');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
