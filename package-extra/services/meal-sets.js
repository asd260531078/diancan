const { callFamilyApi } = require('../../services/cloud');
const { normalizeCategory, normalizeDish } = require('../../utils/schema');
const { normalizeMealSet } = require('../utils/meal-set');

function normalizePayload(data = {}) {
  return {
    items: (data.items || []).map(normalizeMealSet),
    dishes: (data.dishes || []).map(normalizeDish),
    categories: (data.categories || []).map(normalizeCategory),
  };
}

async function listMealSets() {
  return normalizePayload(await callFamilyApi('listMealSets'));
}

async function getMealSetDetail(mealSetId) {
  const data = await callFamilyApi('getMealSetDetail', { mealSetId });
  return {
    item: normalizeMealSet(data.item || {}),
    dishes: (data.dishes || []).map(normalizeDish),
    categories: (data.categories || []).map(normalizeCategory),
  };
}

async function listManageMealSets() {
  return normalizePayload(await callFamilyApi('listManageMealSets'));
}

async function getManageMealSet(mealSetId) {
  const data = await callFamilyApi('getManageMealSet', { mealSetId });
  return {
    item: normalizeMealSet(data.item || {}),
    dishes: (data.dishes || []).map(normalizeDish),
    categories: (data.categories || []).map(normalizeCategory),
  };
}

async function createMealSet(mealSet) {
  return callFamilyApi('createMealSet', { mealSet });
}

async function updateMealSet(mealSetId, patch) {
  return callFamilyApi('updateMealSet', { mealSetId, patch });
}

async function deleteMealSet(mealSetId) {
  return callFamilyApi('deleteMealSet', { mealSetId });
}

module.exports = {
  createMealSet,
  deleteMealSet,
  getManageMealSet,
  getMealSetDetail,
  listManageMealSets,
  listMealSets,
  updateMealSet,
};
