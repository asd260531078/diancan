const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function installData(instance, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (key.startsWith('form.')) instance.data.form[key.slice(5)] = value;
    else instance.data[key] = value;
  });
}

let component;
const imageCache = {
  setImageData(owner, patch, callback) {
    owner.setData(patch);
    if ('cover' in patch) owner.setData({ displayCover: patch.cover || '/images/default-dish.png' });
    if (callback) callback();
  },
  handleImageError(owner, source, fallback) { owner.setData({ displayCover: fallback }); },
  releaseView() {},
};
vm.runInNewContext(read('components/order-item-row/index.js'), {
  Component(config) { component = config; },
  require(file) { assert.strictEqual(file, '../../services/imageCache'); return imageCache; },
});
const row = {
  data: { displayCover: '/images/default-dish.png' },
  setData(patch) { installData(this, patch); },
};
component.properties.item.observer.call(row, { cover: 'cloud://env/orders/item.png' });
assert.strictEqual(row.data.displayCover, 'cloud://env/orders/item.png');
assert.strictEqual(row.data.cover, 'cloud://env/orders/item.png', '原始 fileID 保留');
component.methods.onImageError.call(row);
assert.strictEqual(row.data.displayCover, '/images/default-dish.png');
component.properties.item.observer.call(row, { cover: 'wxfile://temp.png' });
assert.strictEqual(row.data.displayCover, 'wxfile://temp.png', '非 cloud 来源原样交给图片组件');
component.properties.item.observer.call(row, { image: 'cloud://env/legacy.png' });
assert.strictEqual(row.data.displayCover, 'cloud://env/legacy.png');

let categoryPage;
let chooseOptions;
let uploadFailure = false;
let payload;
let shown = 0;
let hidden = 0;
const imageService = {
  async uploadImage(file, purpose) {
    assert.strictEqual(file, 'wxfile://test.png');
    assert.strictEqual(purpose, 'dish-gallery');
    if (uploadFailure) throw new Error('上传失败');
    return { fileID: 'cloud://env/dishes/gallery/category.png' };
  },
  isCloudFileID: value => typeof value === 'string' && value.startsWith('cloud://'),
};
vm.runInNewContext(read('package-admin/category-manage/category-manage.js'), {
  Page(config) { categoryPage = config; },
  getApp: () => ({ globalData: {} }),
  require(file) {
    if (file === '../../services/imageCache') return imageCache;
    if (file === '../../services/image') return imageService;
    if (file === '../../services/catalog') return {
      createCategory: async value => { payload = value; },
      listCategories: async () => ({ items: [] }),
    };
    if (file === '../../services/auth') return {};
    throw new Error(file);
  },
  wx: {
    chooseMedia(options) {
      chooseOptions = options;
      options.success({ tempFiles: [{ tempFilePath: 'wxfile://test.png' }] });
    },
    showLoading() { shown += 1; },
    hideLoading() { hidden += 1; },
    showToast() {},
  },
  console,
});
categoryPage.data = { ...categoryPage.data, isAdmin: true, form: { name: '透明分类', type: 'food', icon: 'rice', sort: 10, enabled: true } };
categoryPage.setData = function setData(patch) { installData(this, patch); };

(async () => {
  uploadFailure = true;
  await categoryPage.onUploadIcon();
  assert.strictEqual(categoryPage.data.form.icon, 'rice', '上传失败保留原 icon');
  assert.strictEqual(shown, 1);
  assert.strictEqual(hidden, 1);
  uploadFailure = false;
  await categoryPage.onUploadIcon();
  assert.deepStrictEqual(Array.from(chooseOptions.sizeType), ['original'], 'PNG 不压缩为不透明图片');
  assert.strictEqual(categoryPage.data.form.icon, 'cloud://env/dishes/gallery/category.png');
  assert.strictEqual(shown, hidden);
  await categoryPage.onSave();
  assert.strictEqual(payload.icon, 'cloud://env/dishes/gallery/category.png', '仅保存云 fileID');

  const menu = read('pages/menu/menu.wxml');
  const drink = read('components/drink-option-sheet/index.wxml');
  assert.ok(drink.includes("item.key === 'cupSize'"));
  assert.ok(!drink.includes('spec-option-check'), '选中项不显示勾');
  assert.ok(menu.includes("class='cart-summary-box' bindtap='toggleCart'"));
  assert.ok(menu.includes("class='checkout-btn' catchtap='goCheckout'"));
  assert.ok(menu.includes("mode='aspectFit' binderror='onCategoryIconError'"));
  assert.ok(read('package-order/orders/orders.wxml').includes('<order-item-row'));
  assert.ok(read('package-admin/manage-orders/manage-orders.wxml').includes('<order-item-row'));
  assert.ok(read('components/order-item-row/index.wxss').includes('min-width: 0'));
  console.log('UI consolidation tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
