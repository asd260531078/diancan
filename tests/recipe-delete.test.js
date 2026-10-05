const assert = require('assert');

let pageDefinition;
let modalConfirm = true;
const modalContents = [];

global.getApp = () => ({ globalData: {} });
global.Page = definition => {
  pageDefinition = definition;
};
global.wx = {
  showModal(options) {
    modalContents.push(options.content);
    options.success({ confirm: modalConfirm, cancel: !modalConfirm });
  },
};

require('../package-admin/dish-edit/dish-edit');

function contextWithRecipe(ingredients, steps) {
  return {
    data: { form: { ingredients, steps } },
    setData(patch) {
      if (Object.prototype.hasOwnProperty.call(patch, 'form.ingredients')) {
        this.data.form.ingredients = patch['form.ingredients'];
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'form.steps')) {
        this.data.form.steps = patch['form.steps'];
      }
    },
  };
}

function event(index, direction) {
  return { currentTarget: { dataset: { index, direction } } };
}

async function testIngredientDeleteAndStableIds() {
  const context = contextWithRecipe([
    { id: 'ingredient_a', name: '鸡翅' },
    { id: 'ingredient_b', name: '可乐' },
    { id: 'ingredient_c', name: '姜' },
  ], []);

  await pageDefinition.onDeleteIngredient.call(context, event(1));
  assert.deepStrictEqual(context.data.form.ingredients.map(item => item.id), ['ingredient_a', 'ingredient_c']);
  assert.strictEqual(modalContents.at(-1), '确定删除这个食材吗？');

  pageDefinition.onMoveIngredient.call(context, event(1, 'up'));
  assert.deepStrictEqual(context.data.form.ingredients.map(item => item.id), ['ingredient_c', 'ingredient_a']);
  await pageDefinition.onDeleteIngredient.call(context, event(0));
  await pageDefinition.onDeleteIngredient.call(context, event(0));
  assert.deepStrictEqual(context.data.form.ingredients, []);
}

async function testStepDeleteResequencesAndKeepsIds() {
  const context = contextWithRecipe([], [
    { id: 'step_a', stepNumber: 1, description: '第一步', image: '' },
    { id: 'step_b', stepNumber: 2, description: '第二步', image: 'cloud://env/dishes/steps/b.jpg' },
    { id: 'step_c', stepNumber: 3, description: '第三步', image: '' },
    { id: 'step_d', stepNumber: 4, description: '第四步', image: '' },
  ]);

  await pageDefinition.onDeleteStep.call(context, event(1));
  assert.deepStrictEqual(context.data.form.steps.map(item => item.id), ['step_a', 'step_c', 'step_d']);
  assert.deepStrictEqual(context.data.form.steps.map(item => item.stepNumber), [1, 2, 3]);
  assert.ok(modalContents.at(-1).includes('删除步骤后，该步骤将不再显示。'));

  pageDefinition.onMoveStep.call(context, event(2, 'up'));
  assert.deepStrictEqual(context.data.form.steps.map(item => item.id), ['step_a', 'step_d', 'step_c']);
  assert.deepStrictEqual(context.data.form.steps.map(item => item.stepNumber), [1, 2, 3]);

  await pageDefinition.onDeleteStep.call(context, event(0));
  await pageDefinition.onDeleteStep.call(context, event(0));
  await pageDefinition.onDeleteStep.call(context, event(0));
  assert.deepStrictEqual(context.data.form.steps, []);
}

async function testCancelKeepsCurrentItem() {
  const context = contextWithRecipe([{ id: 'ingredient_keep', name: '盐' }], []);
  modalConfirm = false;
  await pageDefinition.onDeleteIngredient.call(context, event(0));
  modalConfirm = true;
  assert.deepStrictEqual(context.data.form.ingredients.map(item => item.id), ['ingredient_keep']);
}

Promise.resolve()
  .then(testIngredientDeleteAndStableIds)
  .then(testStepDeleteResequencesAndKeepsIds)
  .then(testCancelKeepsCurrentItem)
  .then(() => console.log('recipe-delete tests passed'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
