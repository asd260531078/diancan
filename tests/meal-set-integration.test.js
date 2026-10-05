const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isPageRegistered } = require('./page-registration');

const root = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const api = fs.readFileSync(path.join(root, 'cloudfunctions/familyApi/index.js'), 'utf8');
const services = [
  'package-extra/services/meal-sets.js',
  'package-admin/services/meal-sets.js',
].map(file => fs.readFileSync(path.join(root, file), 'utf8'));
const detail = fs.readFileSync(path.join(root, 'package-extra/meal-set-detail/meal-set-detail.js'), 'utf8');
const edit = fs.readFileSync(path.join(root, 'package-admin/meal-set-edit/meal-set-edit.js'), 'utf8');
const upload = fs.readFileSync(path.join(root, 'cloudfunctions/uploadImage/index.js'), 'utf8');

[
  'package-extra/meal-sets/meal-sets',
  'package-extra/meal-set-detail/meal-set-detail',
  'package-admin/meal-set-manage/meal-set-manage',
  'package-admin/meal-set-edit/meal-set-edit',
].forEach(page => assert.ok(isPageRegistered(app, page)));

['createMealSet', 'updateMealSet', 'deleteMealSet', 'listManageMealSets', 'getManageMealSet', 'listMealSets', 'getMealSetDetail']
  .forEach(action => assert.ok(api.includes(action)));
['createMealSet', 'updateMealSet', 'deleteMealSet', 'listManageMealSets', 'getManageMealSet']
  .forEach(action => {
    const pattern = new RegExp(`async function ${action}\\([^)]*openid[^)]*\\) \\{\\s*await assertAdmin\\(openid\\)`);
    assert.ok(pattern.test(api), `${action} must verify admin`);
  });
assert.ok(api.includes(".filter(item => item.enabled)"));
assert.ok(api.includes("db.collection('mealSets')"));
services.forEach(service => {
  assert.ok(service.includes("callFamilyApi('listMealSets')"));
  assert.ok(service.includes("callFamilyApi('createMealSet'"));
});
assert.ok(detail.includes('createMealBatch'));
assert.ok(detail.includes('currentMealBatchQuantity'));
assert.ok(detail.includes('cartService.addDishes'));
assert.ok(detail.includes('cancelMealBatch'));
assert.ok(edit.includes("uploadImage(filePath, 'meal-set-cover')"));
assert.ok(upload.includes("'meal-set-cover': 'meal-sets/cover'"));

console.log('meal set integration tests passed');
