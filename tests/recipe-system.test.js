const assert = require('assert');
const fs = require('fs');
const path = require('path');
const clientSchema = require('../utils/schema');
const serverSchema = require('../cloudfunctions/familyApi/schema');

const cloudImage = 'cloud://family-env.1234/dishes/steps/step.jpg';

function testLegacyRecipeReadFallback() {
  const raw = {
    _id: 'legacy-recipe',
    name: '可乐鸡翅',
    type: 'food',
    categoryId: 'cat_main',
    categoryName: '主菜',
    ingredients: [],
    legacyIngredients: '鸡翅 500g\n可乐 330ml',
    steps: [],
    legacySteps: '1. 洗净鸡翅\n2. 煎至两面金黄',
  };
  const clientDish = clientSchema.normalizeDish(raw);
  const serverDish = serverSchema.publicDish(raw);
  [clientDish, serverDish].forEach(dish => {
    assert.strictEqual(dish.ingredients.length, 2);
    assert.strictEqual(dish.ingredients[0].name, '鸡翅');
    assert.strictEqual(dish.ingredients[0].amount, '500g');
    assert.ok(dish.ingredients[0].id.startsWith('ingredient_'));
    assert.strictEqual(dish.steps.length, 2);
    assert.strictEqual(dish.steps[0].description, '洗净鸡翅');
    assert.ok(dish.steps[0].id.startsWith('step_'));
  });
}

function testStructuredRecipeWriteAndStableIds() {
  const written = serverSchema.dishForWrite({
    name: '可乐鸡翅',
    type: 'food',
    ingredients: [
      { id: 'ingredient_wings', name: '鸡翅', amount: '500g', note: '使用中翅' },
      { id: 'ingredient_cola', name: '可乐', amount: '330ml', note: '' },
      { id: 'ingredient_empty', name: '   ', amount: '3片', note: '' },
    ],
    steps: [
      { id: 'step_fry', stepNumber: 9, title: '煎制', description: '煎至两面金黄', image: cloudImage },
      { id: 'step_cola', stepNumber: 3, title: '炖煮', description: '加入可乐和调味料', image: '' },
      { id: 'step_invalid', stepNumber: 1, title: '空步骤', description: '  ', image: cloudImage },
    ],
  }, { id: 'cat_main', name: '主菜', type: 'food' });

  assert.deepStrictEqual(written.ingredients.map(item => item.id), ['ingredient_wings', 'ingredient_cola']);
  assert.deepStrictEqual(written.ingredients.map(item => item.name), ['鸡翅', '可乐']);
  assert.deepStrictEqual(written.steps.map(item => item.id), ['step_fry', 'step_cola']);
  assert.deepStrictEqual(written.steps.map(item => item.stepNumber), [1, 2]);
  assert.strictEqual(written.steps[0].image, cloudImage);
  assert.strictEqual(written.legacyIngredients, '鸡翅 500g\n可乐 330ml');
  assert.strictEqual(written.legacySteps, '1. 煎至两面金黄\n2. 加入可乐和调味料');
}

function testRecipeValidationAndGeneratedIds() {
  const category = { id: 'cat_main', name: '主菜', type: 'food' };
  assert.throws(
    () => serverSchema.dishForWrite({ name: '错误菜谱', type: 'food', ingredients: '鸡翅' }, category),
    error => error.code === 'INVALID_FIELD',
  );
  assert.throws(
    () => serverSchema.dishForWrite({
      name: '错误菜谱', type: 'food', ingredients: [{ name: '鸡翅', amount: 500, note: '' }],
    }, category),
    error => error.code === 'INVALID_FIELD',
  );
  assert.throws(
    () => serverSchema.dishForWrite({
      name: '错误菜谱', type: 'food', steps: [{ description: '完成', image: 'wxfile://tmp.jpg' }],
    }, category),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );

  const generated = serverSchema.dishForWrite({
    name: '测试菜谱',
    type: 'food',
    ingredients: [{ name: '盐', amount: '适量', note: '' }],
    steps: [{ title: '', description: '加入盐', image: '' }],
  }, category);
  assert.ok(generated.ingredients[0].id.startsWith('ingredient_'));
  assert.ok(generated.steps[0].id.startsWith('step_'));
}

function testDrinkRecipeKeepsPhase2COptions() {
  const written = serverSchema.dishForWrite({
    name: '百香果柠檬茶',
    type: 'drink',
    ingredients: [{ id: 'ingredient_lemon', name: '柠檬', amount: '3片', note: '去籽' }],
    steps: [{ id: 'step_muddle', description: '轻捣柠檬释放香气', title: '捣香', image: '' }],
    tips: '柠檬不要捣太久。',
    availableSugarLevels: ['正常糖', '半糖'],
    availableTemperatures: ['去冰', '少冰'],
    availableSweetenerTypes: ['普通糖浆', '蜂蜜'],
    availableToppings: ['椰果', '寒天晶球'],
  }, { id: 'cat_drink', name: '饮品', type: 'drink' });
  assert.strictEqual(written.ingredients[0].id, 'ingredient_lemon');
  assert.strictEqual(written.steps[0].id, 'step_muddle');
  assert.deepStrictEqual(written.availableSugarLevels, ['正常甜', '半甜']);
  assert.deepStrictEqual(written.availableTemperatures, ['去冰', '少冰']);
  assert.deepStrictEqual(written.availableSweetenerTypes, ['普通糖浆', '蜂蜜']);
  assert.deepStrictEqual(written.availableToppings, ['椰果', '寒天晶球']);
}

function testOptionalImageValidation() {
  const category = { id: 'cat_main', name: '主菜', type: 'food' };
  const stepCloudImage = 'cloud://family-env.1234/dishes/steps/step.jpg';
  const coverCloudImage = 'cloud://family-env.1234/dishes/cover/cover.jpg';

  const noCoverWithStepImage = serverSchema.dishForWrite({
    name: '无主图菜品',
    type: 'food',
    cover: '',
    image: '/images/default-dish.png',
    images: [],
    steps: [{ id: 'step_cloud', description: '完成制作', image: stepCloudImage }],
  }, category);
  assert.strictEqual(noCoverWithStepImage.cover, '');
  assert.strictEqual(noCoverWithStepImage.steps[0].image, stepCloudImage);

  const cloudImages = serverSchema.dishForWrite({
    name: '有云图片菜品',
    type: 'food',
    cover: coverCloudImage,
    images: ['', stepCloudImage],
    steps: [{ id: 'step_empty_image', description: '不需要步骤图片', image: '' }],
  }, category);
  assert.strictEqual(cloudImages.cover, coverCloudImage);
  assert.deepStrictEqual(cloudImages.images, [stepCloudImage]);
  assert.strictEqual(cloudImages.steps[0].image, '');

  assert.throws(
    () => serverSchema.dishForWrite({
      name: '非法步骤图片',
      type: 'food',
      cover: '',
      steps: [{ description: '不能保存临时图片', image: 'wxfile://tmp/step.jpg' }],
    }, category),
    error => error.code === 'INVALID_IMAGE_FILE_ID',
  );
}

function testDetailRecipeContract() {
  const root = path.resolve(__dirname, '..');
  const detailWxml = fs.readFileSync(path.join(root, 'package-extra/detail/detail.wxml'), 'utf8');
  assert.ok(detailWxml.includes('singleDish.ingredients.length > 0'));
  assert.ok(detailWxml.includes("singleDish.type === 'drink' ? '原料' : '食材'"));
  assert.ok(detailWxml.includes('singleDish.steps.length > 0'));
  assert.ok(detailWxml.includes("wx:if='{{step.title}}'"));
  assert.ok(detailWxml.includes("wx:if='{{step.displayImage}}'"));
  assert.ok(detailWxml.includes("wx:if='{{singleDish.tips}}'"));
}

testLegacyRecipeReadFallback();
testStructuredRecipeWriteAndStableIds();
testRecipeValidationAndGeneratedIds();
testDrinkRecipeKeepsPhase2COptions();
testOptionalImageValidation();
testDetailRecipeContract();
console.log('recipe-system tests passed');
