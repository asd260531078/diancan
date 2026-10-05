const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isPageRegistered } = require('./page-registration');

const root = path.resolve(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const manageJs = fs.readFileSync(path.join(root, 'package-admin/manage/manage.js'), 'utf8');
const manageWxml = fs.readFileSync(path.join(root, 'package-admin/manage/manage.wxml'), 'utf8');
const editJs = fs.readFileSync(path.join(root, 'package-admin/dish-edit/dish-edit.js'), 'utf8');
const editWxml = fs.readFileSync(path.join(root, 'package-admin/dish-edit/dish-edit.wxml'), 'utf8');
const imageService = fs.readFileSync(path.join(root, 'services/image.js'), 'utf8');
const uploadImage = fs.readFileSync(path.join(root, 'cloudfunctions/uploadImage/index.js'), 'utf8');

assert.ok(isPageRegistered(appConfig, 'package-admin/dish-edit/dish-edit'), 'dish-edit page must be registered');
assert.ok(manageJs.includes("wx.navigateTo({ url: '/package-admin/dish-edit/dish-edit' })"), 'add action must open dish-edit');
assert.ok(manageJs.includes('/package-admin/dish-edit/dish-edit?id='), 'edit action must pass the dish id');
assert.ok(!manageWxml.includes('form-popup'), 'manage list must not keep the old embedded form');
assert.ok(editJs.includes('authService.getSession(true)'), 'dish-edit must verify the current session');
assert.ok(editJs.includes('catalogService.createDish(payload)'), 'dish-edit must create through catalog service');
assert.ok(editJs.includes('catalogService.updateDish(this.data.dishId, payload)'), 'dish-edit must update through catalog service');
assert.ok(imageService.includes("name: 'uploadImage'"), 'image service must reuse uploadImage');
assert.ok(imageService.includes("startsWith('cloud://')"), 'image service must reject non-cloud file ids');
assert.ok(uploadImage.includes('await cloud.uploadFile'), 'uploadImage must write to CloudBase storage');
assert.ok(uploadImage.includes('fileID'), 'uploadImage must return a fileID');
assert.ok(uploadImage.includes("'dishes/cover'"), 'dish covers must use a dedicated storage path');
assert.ok(uploadImage.includes("'dishes/gallery'"), 'dish gallery images must use a dedicated storage path');
assert.ok(uploadImage.includes("'dishes/steps'"), 'dish step images must use a dedicated storage path');
assert.ok(uploadImage.includes("'drinks/cover'"), 'drink images must use a dedicated storage path');
assert.ok(!uploadImage.includes('showLoading'), 'cloud upload function must not manage page loading UI');

const showLoadingCount = (editJs.match(/wx\.showLoading\(/g) || []).length;
const hideLoadingCount = (editJs.match(/wx\.hideLoading\(/g) || []).length;
assert.strictEqual(showLoadingCount, 4, 'dish-edit should have one loading call per upload/save flow');
assert.strictEqual(hideLoadingCount, showLoadingCount, 'showLoading and hideLoading counts must match');
assert.ok(!editJs.includes('result.url'), 'dish-edit must use fileID instead of a public URL');

[
  'name', 'type', 'categoryId', 'cover', 'images', 'description', 'tagsText', 'price',
  'estimatedTime', 'servingSize', 'spicyLevel', 'ingredients', 'steps', 'tips',
  'recommended', 'signature', 'availableToday', 'soldOut', 'enabled', 'sort',
].forEach(field => {
  assert.ok(editWxml.includes(`form.${field}`), `dish-edit must expose ${field}`);
});

['availableCupSizes', 'availableSugarLevels', 'availableTemperatures', 'availableSweetenerTypes'].forEach(field => {
  assert.ok(editWxml.includes(`data-field="${field}"`), `dish-edit must expose ${field}`);
});
assert.ok(editJs.includes('CUP_SIZE_OPTIONS'), 'dish-edit must reuse centralized cup-size presets');
assert.ok(editJs.includes('onAddCustomCupSize'), 'dish-edit must support custom cup sizes');
assert.ok(editJs.includes('onRemoveCustomCupSize'), 'dish-edit must remove custom cup sizes');
assert.ok(editJs.includes('availableCupSizes: switchingToFood ? []'), 'switching to food must clear cup sizes');
assert.ok(editJs.includes('availableToppings'), 'dish-edit must expose availableToppings');
assert.ok(editJs.includes("console.log('SAVE DISH PAYLOAD:', payload)"), 'dish-edit must log the final save payload');

assert.ok(editJs.includes("require('../../config/drink-options')"), 'dish-edit must reuse centralized drink options');
assert.ok(!editWxml.includes('正常糖'), 'dish-edit must not hard-code legacy sugar labels');
assert.ok(!editWxml.includes('无糖'), 'dish-edit must not hard-code the misleading no-sugar label');
assert.ok(editJs.includes('onDrinkOptionChange'), 'dish-edit must support drink option changes');
assert.ok(editJs.includes('onToppingGroupChange'), 'dish-edit must support grouped topping changes');
assert.ok(editJs.includes('onAddCustomTopping'), 'dish-edit must support custom toppings');
assert.ok(editWxml.includes("form.type === 'drink'"), 'drink options must only render for drinks');
assert.ok(editJs.includes('onAddIngredient'), 'dish-edit must add ingredients');
assert.ok(editJs.includes('onDeleteIngredient'), 'dish-edit must delete ingredients');
assert.ok(editJs.includes('确定删除这个食材吗？'), 'ingredient deletion must require confirmation');
assert.ok(editJs.includes('onMoveIngredient'), 'dish-edit must reorder ingredients');
assert.ok(editJs.includes('onAddStep'), 'dish-edit must add recipe steps');
assert.ok(editJs.includes('onDeleteStep'), 'dish-edit must delete recipe steps');
assert.ok(editJs.includes('删除步骤后，该步骤将不再显示。'), 'step deletion must warn when removing a pictured step');
assert.ok(editJs.includes('onMoveStep'), 'dish-edit must reorder recipe steps');
assert.strictEqual((editWxml.match(/delete-action/g) || []).length, 2, 'ingredient and step cards must show delete actions');
assert.strictEqual((editWxml.match(/class="reorder-actions"/g) || []).length, 2, 'move actions must render on a separate row');
assert.ok(!editWxml.includes('class="card-actions"'), 'delete must not share the old crowded action row');
assert.ok(editJs.includes('onChooseStepImage'), 'dish-edit must upload recipe step images');
assert.ok(editJs.includes("'drink-step' : 'dish-step'"), 'step images must use the existing purpose-specific upload flow');
assert.ok(!editWxml.includes('ingredientsText'), 'legacy ingredients textarea must be replaced');
assert.ok(!editWxml.includes('stepsText'), 'legacy steps textarea must be replaced');
assert.ok(!editWxml.includes('&#10;'), 'placeholders must not depend on encoded newlines');
assert.ok(!editWxml.includes('placeholder='), 'dish-edit input and textarea examples must be removed');
assert.ok(editJs.includes('resolveCategorySelection'), 'dish-edit must centralize category selection resolution');
assert.ok(editJs.includes("availableCategories.length === 1 ? availableCategories[0] : null"), 'one compatible category must be selected automatically');
assert.ok(!editJs.includes('当前分类不适用于'), 'type switching must not show the old incompatible-category toast');

const previousGetApp = global.getApp;
const previousPage = global.Page;
let editPage;
global.getApp = () => ({ globalData: {} });
global.Page = config => { editPage = config; };
delete require.cache[require.resolve(path.join(root, 'package-admin/dish-edit/dish-edit.js'))];
require(path.join(root, 'package-admin/dish-edit/dish-edit.js'));
global.getApp = previousGetApp;
global.Page = previousPage;

const categories = [
  { id: 'food-main', name: '主菜', type: 'food', enabled: true },
  { id: 'drink-main', name: '饮品', type: 'drink', enabled: true },
  { id: 'all-featured', name: '特色推荐', type: 'all', enabled: true },
  { id: 'drink-disabled', name: '停用饮品', type: 'drink', enabled: false },
];
const drinkCategories = editPage.getAvailableCategories(categories, 'drink');
assert.deepStrictEqual(drinkCategories.map(item => item.id), ['drink-main', 'all-featured']);
assert.deepStrictEqual(
  editPage.resolveCategorySelection(drinkCategories, 'all-featured'),
  { categoryId: 'all-featured', categoryName: '特色推荐' },
  'an all category must survive a food/drink type switch',
);
assert.deepStrictEqual(
  editPage.resolveCategorySelection([{ id: 'drink-main', name: '饮品' }], 'food-main'),
  { categoryId: 'drink-main', categoryName: '饮品' },
  'the only compatible category must be selected',
);
assert.deepStrictEqual(
  editPage.resolveCategorySelection(drinkCategories, 'food-main'),
  { categoryId: '', categoryName: '' },
  'multiple compatible categories must not be selected arbitrarily',
);

console.log('dish-edit contract tests passed');
