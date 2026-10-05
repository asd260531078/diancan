const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const schema = require('../utils/schema');
const storage = new Map();
let offline = false;
const dish = { id: 'dish-1', name: '炒饭', cover: 'cloud://env/dish.png', enabled: true };
const category = { id: 'rice', name: '米饭', type: 'food', enabled: true };

function loadCatalog() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/catalog.js'), 'utf8'), {
    module,
    require(name) {
      if (name === '../utils/schema') return schema;
      assert.strictEqual(name, './cloud');
      return {
        async callFamilyApi(action) {
          if (offline) throw new Error('offline');
          return { items: action === 'listDishes' ? [dish] : [category] };
        },
      };
    },
    wx: {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    },
    console: { warn() {} },
  });
  return module.exports;
}

async function run() {
  let catalog = loadCatalog();
  await catalog.listDishes();
  await catalog.listCategories();
  offline = true;
  catalog = loadCatalog();
  const snapshot = catalog.getCachedCatalog();
  assert.strictEqual(snapshot.dishes[0].cover, dish.cover, 'snapshot preserves the original cloud fileID');
  assert.strictEqual(snapshot.dishes[0].displayCover, undefined, 'snapshot must not persist UI/local paths');
  assert.strictEqual(snapshot.categories[0].id, category.id);
  assert.strictEqual((await catalog.listDishes()).source, 'cache');
  assert.strictEqual((await catalog.listCategories()).source, 'cache');
  await assert.rejects(catalog.listDishes({ allowLocalFallback: false }), /offline/);
  await assert.rejects(catalog.listCategories({ allowLocalFallback: false }), /offline/);
  await assert.rejects(catalog.listDishes({ includeDisabled: true }), /offline/);
  await assert.rejects(catalog.listCategories({ includeDisabled: true }), /offline/);
  console.log('catalog cache: cold/offline read-only snapshot, original covers and strict/admin reads passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
