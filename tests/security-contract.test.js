const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const familyApi = fs.readFileSync(path.join(root, 'cloudfunctions/familyApi/index.js'), 'utf8');
const uploadImage = fs.readFileSync(path.join(root, 'cloudfunctions/uploadImage/index.js'), 'utf8');
const orderService = fs.readFileSync(path.join(root, 'services/orders.js'), 'utf8');

const protectedHandlers = [
  'createDish',
  'updateDish',
  'deleteDish',
  'createCategory',
  'updateCategory',
  'deleteCategory',
  'reorderCategories',
  'seedDefaultCategories',
  'importLegacyDishes',
  'migrateDishesV2',
];

protectedHandlers.forEach(handler => {
  const declaration = `async function ${handler}(event, openid) {\n  await assertAdmin(openid);`;
  assert.ok(familyApi.includes(declaration), `${handler} must begin with server-side assertAdmin`);
});

['listManageOrders', 'getManageOrderDetail', 'updateOrderStatus'].forEach(handler => {
  const declaration = `async function ${handler}(event, openid) {\n  await assertAdmin(openid);`;
  assert.ok(familyApi.includes(declaration), `${handler} must begin with server-side assertAdmin`);
});
assert.ok(familyApi.includes('cloud.getWXContext()'), 'identity must come from cloud context');
assert.ok(familyApi.includes("throw appError('UNKNOWN_ACTION', '未知操作')"));
assert.ok(familyApi.includes("code: error.isAppError === true ? error.code : 'INTERNAL_ERROR'"));
assert.ok(familyApi.includes("message: error.isAppError === true ? error.message : '服务暂时不可用，请稍后重试'"));
assert.ok(!orderService.includes('wx.cloud.database'), 'order service must not directly access cloud database');

assert.ok(uploadImage.includes('!(await isAdmin(openid))'), 'uploadImage must reject non-admin users');

const clientFiles = [
  'pages/menu/menu.js',
  'package-admin/manage/manage.js',
  'package-admin/dish-edit/dish-edit.js',
  'package-admin/category-manage/category-manage.js',
  'pages/profile/profile.js',
  'services/auth.js',
  'services/catalog.js',
  'services/image.js',
];
clientFiles.forEach(file => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(!source.includes('wx.cloud.database'), `${file} must use the service layer instead of direct database access`);
});

console.log('security-contract tests passed');
