const assert = require('assert');
const Module = require('module');
const path = require('path');

// 内存版云数据库：只实现 familyApi 目录接口用到的调用。
const collections = new Map();
const reads = { dishes: 0, meta: 0 };
let projections = [];
function table(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}
function query(name, state = {}) {
  return {
    field(projection) { return query(name, { ...state, projection }); },
    skip(skip) { return query(name, { ...state, skip }); },
    limit(limit) { return query(name, { ...state, limit }); },
    where(filter) { return query(name, { ...state, filter }); },
    async get() {
      if (!collections.has(name)) throw new Error(`collection ${name} not exists`);
      if (name === 'dishes') reads.dishes += 1;
      if (state.projection) projections.push(state.projection);
      let rows = [...table(name).values()];
      if (state.filter) rows = rows.filter(row => Object.entries(state.filter).every(([key, value]) => row[key] === value));
      rows = rows.slice(state.skip || 0, (state.skip || 0) + (state.limit || 100)).map(row => {
        const copy = JSON.parse(JSON.stringify(row));
        Object.entries(state.projection || {}).forEach(([key, keep]) => { if (keep === false) delete copy[key]; });
        return copy;
      });
      return { data: rows };
    },
    doc(id) {
      return {
        async get() {
          if (name === 'meta') reads.meta += 1;
          if (!table(name).has(id)) throw new Error('document not exists');
          return { data: JSON.parse(JSON.stringify(table(name).get(id))) };
        },
        async set({ data }) {
          if (!collections.has(name)) throw new Error(`collection ${name} not exists`);
          table(name).set(id, { _id: id, ...data });
        },
        async update({ data }) {
          if (!table(name).has(id)) return { stats: { updated: 0 } };
          table(name).set(id, { ...table(name).get(id), ...data });
          return { stats: { updated: 1 } };
        },
      };
    },
  };
}
const db = {
  collection: name => query(name),
  serverDate: () => new Date(0),
  async createCollection(name) { table(name); },
};
const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'env',
  init() {},
  database: () => db,
  getWXContext: () => ({ OPENID: currentOpenid }),
};
let currentOpenid = 'customer';
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeSdk;
  return originalLoad.call(this, request, parent, isMain);
};
const api = require(path.join(__dirname, '../cloudfunctions/familyApi/index.js'));
Module._load = originalLoad;

const call = (action, data = {}) => api.main({ action, ...data });

async function run() {
  table('users');
  table('admins').set('chef', { _id: 'chef', openid: 'chef', enabled: true });
  table('categories').set('hot', { _id: 'hot', id: 'hot', name: '热菜', type: 'food', sort: 1, enabled: true });
  table('categories').set('off', { _id: 'off', id: 'off', name: '停用', type: 'food', sort: 2, enabled: false });
  for (let index = 0; index < 1200; index += 1) {
    table('dishes').set(`d${index}`, {
      _id: `d${index}`, id: `d${index}`, name: `菜${index}`, type: 'food', categoryId: index === 5 ? 'off' : 'hot',
      categoryName: '热菜', cover: 'cloud://env/a.png', price: index, sort: index, enabled: index !== 7,
      steps: [{ stepNumber: 1, description: '很长的做法'.repeat(500) }],
      ingredients: [{ name: '鸡蛋', amount: '2 个' }], legacySteps: '旧做法'.repeat(3000), tips: '小贴士',
      images: ['cloud://env/g.png'],
    });
  }

  // 无版本号（meta 集合不存在）时，仍返回完整摘要，不报错。
  let result = await call('getCatalog');
  assert.strictEqual(result.success, true, JSON.stringify(result));
  assert.strictEqual(result.data.version, '');
  assert.strictEqual(result.data.dishes.length, 1198, 'disabled dish and dish in disabled category are hidden');
  assert.deepStrictEqual(result.data.categories.map(item => item.id), ['hot']);
  const first = result.data.dishes[0];
  ['steps', 'ingredients', 'legacySteps', 'tips', 'images', '_openid'].forEach(key => {
    assert.ok(!(key in first), `summary must not include ${key}`);
  });
  assert.ok(projections.every(item => item.steps === false && item.legacySteps === false), 'heavy fields are excluded in the DB query');
  assert.ok(JSON.stringify(result.data).length < 1200 * 1500, 'summary payload stays small');

  // 管理员写操作后产生版本号；相同版本号直接返回 notModified。
  currentOpenid = 'chef';
  result = await call('updateDish', { dishId: 'd1', patch: { price: 99 } });
  assert.strictEqual(result.success, true, JSON.stringify(result));
  const version = table('meta').get('catalog').version;
  assert.ok(version, 'catalog write bumps the version');
  currentOpenid = 'customer';
  result = await call('getCatalog', { knownVersion: version });
  assert.deepStrictEqual(result.data, { version, notModified: true });

  // 同一实例内同版本复用缓存，不再读 dishes 集合。
  result = await call('getCatalog', { knownVersion: 'old' });
  assert.strictEqual(result.data.dishes.find(item => item.id === 'd1').price, 99);
  const dishReads = reads.dishes;
  result = await call('getCatalog', { knownVersion: 'old' });
  assert.strictEqual(reads.dishes, dishReads, 'warm instance reuses the catalog payload for the same version');
  assert.strictEqual(result.data.dishes.length, 1198);

  // 详情接口返回完整做法；下架菜品只对管理员可见。
  result = await call('getDishDetail', { dishId: 'd2' });
  assert.strictEqual(result.data.item.steps.length, 1);
  assert.strictEqual(result.data.item.ingredients[0].name, '鸡蛋');
  result = await call('getDishDetail', { dishId: 'd7' });
  assert.strictEqual(result.data.item, null);
  result = await call('getDishDetail', { dishId: 'd7', includeDisabled: true });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.code, 'FORBIDDEN');
  currentOpenid = 'chef';
  result = await call('getDishDetail', { dishId: 'd7', includeDisabled: true });
  assert.strictEqual(result.data.item.id, 'd7');
  result = await call('getDishDetail', { dishId: 'missing' });
  assert.strictEqual(result.data.item, null);

  // 旧版客户端不传 summary，仍拿到完整数据；新客户端可要求摘要。
  result = await call('listDishes', { includeDisabled: true });
  assert.strictEqual(result.data.items.length, 1200);
  assert.ok(result.data.items[0].steps.length > 0);
  result = await call('listDishes', { includeDisabled: true, summary: true });
  assert.ok(!('steps' in result.data.items[0]));

  // 非管理员调用写接口被拒绝，不改版本号。
  currentOpenid = 'customer';
  const beforeForbidden = table('meta').get('catalog').version;
  result = await call('deleteDish', { dishId: 'd1' });
  assert.strictEqual(result.code, 'FORBIDDEN');
  assert.strictEqual(table('meta').get('catalog').version, beforeForbidden);
  currentOpenid = 'chef';

  // dryRun 迁移不改版本号。
  const before = table('meta').get('catalog').version;
  await call('migrateDishesV2', { dryRun: true });
  assert.strictEqual(table('meta').get('catalog').version, before);

  console.log('catalog server passed: summary projection, version/notModified, warm cache, detail visibility, legacy listDishes');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
