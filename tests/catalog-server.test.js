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
    orderBy(field, direction) { return query(name, { ...state, order: [field, direction] }); },
    async update({ data }) {
      let updated = 0;
      table(name).forEach((row, id) => {
        const matches = Object.entries(state.filter || {}).every(([key, value]) => (value && value.$in
          ? value.$in.includes(row[key]) : row[key] === value));
        if (!matches) return;
        table(name).set(id, { ...row, ...data });
        updated += 1;
      });
      return { stats: { updated } };
    },
    async get() {
      if (!collections.has(name)) throw new Error(`collection ${name} not exists`);
      if (name === 'dishes') reads.dishes += 1;
      if (state.projection) projections.push(state.projection);
      let rows = [...table(name).values()];
      if (state.filter) {
        rows = rows.filter(row => Object.entries(state.filter).every(([key, value]) => (value && value.$in
          ? value.$in.includes(row[key]) : row[key] === value)));
      }
      if (state.order) {
        const [field, direction] = state.order;
        rows.sort((a, b) => (String(a[field]) < String(b[field]) ? -1 : String(a[field]) > String(b[field]) ? 1 : 0)
          * (direction === 'desc' ? -1 : 1));
      }
      rows = rows.slice(state.skip || 0, (state.skip || 0) + (state.limit || 100)).map(row => {
        let copy = JSON.parse(JSON.stringify(row));
        const projection = state.projection || {};
        if (Object.values(projection).some(keep => keep === true)) {
          copy = Object.fromEntries(Object.entries(copy).filter(([key]) => projection[key] === true || key === '_id'));
        }
        Object.entries(projection).forEach(([key, keep]) => { if (keep === false) delete copy[key]; });
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
  command: { in: values => ({ $in: values }) },
  collection: name => query(name),
  serverDate: () => new Date(0),
  async createCollection(name) { table(name); },
  async runTransaction(callback) {
    return callback({ collection: name => ({ doc: id => query(name).doc(id) }) });
  },
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

  // 无版本号（meta 集合不存在）时，自动补一个版本号并返回完整摘要。
  let result = await call('getCatalog');
  assert.strictEqual(result.success, true, JSON.stringify(result));
  assert.ok(result.data.version, 'missing meta gets an initial version');
  assert.strictEqual(table('meta').get('catalog').version, result.data.version);
  const initialVersion = result.data.version;
  result = await call('getCatalog', { knownVersion: initialVersion });
  assert.deepStrictEqual(result.data, { version: initialVersion, notModified: true });
  result = await call('getCatalog');
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

  // 菜单小图：单独写入缩略图，之后改状态不会清掉；摘要里带上小图字段，下单用小图。
  result = await call('updateDish', { dishId: 'd3', patch: { coverThumb: 'cloud://env/t3.jpg', coverThumbOf: 'cloud://env/a.png' } });
  assert.strictEqual(result.success, true, JSON.stringify(result));
  await call('updateDish', { dishId: 'd3', patch: { soldOut: false } });
  assert.strictEqual(table('dishes').get('d3').coverThumb, 'cloud://env/t3.jpg');
  assert.ok(table('dishes').get('d3').steps.length > 0, 'thumbnail backfill keeps the recipe');
  const versionBeforeInvalid = table('meta').get('catalog').version;
  result = await call('updateDish', { dishId: 'd3', patch: { coverThumb: 'https://evil/x.png' } });
  assert.strictEqual(result.code, 'INVALID_IMAGE_FILE_ID', 'validation errors reach the admin with their real reason');
  assert.strictEqual(table('meta').get('catalog').version, versionBeforeInvalid, 'a rejected write does not force every client to refetch');
  result = await call('getCatalog');
  assert.strictEqual(result.data.dishes.find(item => item.id === 'd3').coverThumb, 'cloud://env/t3.jpg');
  const { buildOrderItem } = require('../cloudfunctions/familyApi/order-schema');
  const thumbDish = { id: 'x', name: 'x', type: 'food', price: 1, cover: 'cloud://env/a.png',
    coverThumb: 'cloud://env/t.jpg', coverThumbOf: 'cloud://env/a.png' };
  assert.strictEqual(buildOrderItem(thumbDish, { quantity: 1, selectedOptions: {} }).cover, 'cloud://env/t.jpg');
  assert.strictEqual(buildOrderItem({ ...thumbDish, cover: 'cloud://env/new.png' }, { quantity: 1, selectedOptions: {} }).cover,
    'cloud://env/new.png', 'a stale thumbnail is ignored after the cover changes');

  // 管理端一次拿到菜品和分类（含停用分类）。
  result = await call('listDishes', { includeDisabled: true, summary: true, withCategories: true });
  assert.deepStrictEqual(result.data.categories.map(item => item.id), ['hot', 'off']);

  // 分页按 _id 排序：超过 1000 条也不漏不重。
  result = await call('listDishes', { includeDisabled: true, summary: true });
  assert.strictEqual(new Set(result.data.items.map(item => item.id)).size, 1200);

  // 套餐只读取引用的菜品摘要，不读整张表，也不带做法。
  table('mealSets').set('set1', { _id: 'set1', id: 'set1', name: '双人餐', enabled: true, sort: 1,
    items: [{ dishId: 'd3', quantity: 1 }, { dishId: 'd4', quantity: 2 }] });
  projections = [];
  result = await call('listMealSets');
  assert.strictEqual(result.success, true, JSON.stringify(result));
  assert.deepStrictEqual(result.data.dishes.map(item => item.id).sort(), ['d3', 'd4']);
  assert.ok(!('steps' in result.data.dishes[0]) && !('legacySteps' in result.data.dishes[0]));
  assert.ok(projections.some(item => item.steps === false), 'meal set dishes use the summary projection');

  // 厨师端待确认订单摘要只返回 ID，且仅管理员可用。
  table('orders').set('o1', { _id: 'o1', id: 'o1', status: 'pending', userOpenId: 'customer', items: [{ dishId: 'd3', quantity: 2 }] });
  table('orders').set('o2', { _id: 'o2', id: 'o2', status: 'completed', userOpenId: 'customer', items: [{ dishId: 'd4', quantity: 1 }] });
  table('orders').set('o3', { _id: 'o3', id: 'o3', status: 'cancelled', userOpenId: 'customer', items: [{ dishId: 'd9', quantity: 9 }] });
  result = await call('getManagePendingOrderSummary');
  assert.deepStrictEqual(result.data, { count: 1, orderIds: ['o1'] });
  currentOpenid = 'customer';
  result = await call('getManagePendingOrderSummary');
  assert.strictEqual(result.code, 'FORBIDDEN');
  result = await call('getMyFrequentDishes');
  assert.deepStrictEqual(result.data.dishIds, ['d3', 'd4'], 'cancelled orders are ignored');
  currentOpenid = 'chef';

  // 下单：并行读取后直接返回刚写入的订单；同一 requestId 重复提交是幂等的。
  currentOpenid = 'customer';
  const orderReadsBefore = reads.dishes;
  result = await call('createOrder', { requestId: 'req_perf_1', items: [{ dishId: 'd3', quantity: 2, selectedOptions: {} }] });
  assert.strictEqual(result.success, true, JSON.stringify(result));
  assert.strictEqual(result.data.idempotent, false);
  assert.strictEqual(result.data.order.items[0].dishId, 'd3');
  assert.strictEqual(result.data.order.itemCount, 2);
  assert.ok(result.data.order.createdAt instanceof Date);
  assert.strictEqual(reads.dishes, orderReadsBefore, 'order creation reads dishes by document only');
  const created = table('orders').get(result.data.order.id);
  assert.strictEqual(created.userOpenId, 'customer');
  result = await call('createOrder', { requestId: 'req_perf_1', items: [{ dishId: 'd3', quantity: 2, selectedOptions: {} }] });
  assert.strictEqual(result.data.idempotent, true);
  result = await call('createOrder', { requestId: 'req_perf_2', items: [{ dishId: 'd7', quantity: 1, selectedOptions: {} }] });
  assert.strictEqual(result.success, false, 'disabled dish cannot be ordered');
  currentOpenid = 'chef';

  // 分类改名：批量同步菜品上的冗余分类名（1199 道菜引用 hot）。
  result = await call('updateCategory', { categoryId: 'hot', patch: { name: '热炒' } });
  assert.strictEqual(result.success, true, JSON.stringify(result));
  assert.strictEqual(table('dishes').get('d1199').categoryName, '热炒');
  assert.strictEqual(table('dishes').get('d5').categoryName, '热菜', 'dishes of other categories are untouched');

  // dryRun 迁移不改版本号。
  const before = table('meta').get('catalog').version;
  await call('migrateDishesV2', { dryRun: true });
  assert.strictEqual(table('meta').get('catalog').version, before);

  console.log('catalog server passed: summary projection, version/notModified, warm cache, detail visibility, legacy listDishes');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
