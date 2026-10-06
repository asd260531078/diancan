const { isCloudFileID } = require('./image');

const STORAGE_KEY = 'family_image_cache_v2';
const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const MAX_CONCURRENT = 2;
const TIMEOUT_MS = 20000;
const QUEUE_DELAY_MS = 250;
// lastAccess 只用于空间不足时的 LRU 淘汰，一小时精度足够；不必每次命中都整份重写索引。
const ACCESS_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_COVER = '/images/default-dish.png';
let entries;
let fileSystem;
let initialized = false;
let initPromise = null;
let cacheDir = '';
let storageTimer;
let queueTimer;
let generation = 0;
let activeDownloads = 0;
let commitQueue = Promise.resolve();
let debugLogging = false;
const memory = new Map();
const inflight = new Map();
const queued = new Set();
const revisions = new Map();
const downloadQueue = [];
const views = new WeakMap();
const restored = new Set();
const diagnosticState = new Map();

function log(type, fileID, detail) {
  if (!debugLogging) return;
  if (['MISS', 'MEMORY HIT', 'CHECK FAILED'].includes(type) && diagnosticState.get(fileID) === type) return;
  diagnosticState.set(fileID, type);
  if (detail) console.log(`[imageCache ${type}]`, fileID, detail);
  else console.log(`[imageCache ${type}]`, fileID);
}

function saveIndex(immediate = false) {
  if (!initialized) return false; // Never overwrite an index that could not be read yet.
  if (storageTimer) clearTimeout(storageTimer);
  const save = () => {
    storageTimer = null;
    try { wx.setStorageSync(STORAGE_KEY, { version: 2, entries }); return true; }
    catch (_) { log('STORAGE_FAILED', STORAGE_KEY); return false; }
  };
  if (immediate) return save();
  storageTimer = setTimeout(save, 300);
  return true;
}

function isUserPath(path) {
  const root = wx.env && wx.env.USER_DATA_PATH;
  return Boolean(root && typeof path === 'string' && path.startsWith(`${root.replace(/\/+$/, '')}/`));
}

function isSavedPath(path) {
  if (typeof path !== 'string' || !path || /[\\\0?#]/.test(path)
    || path.split('/').includes('..')) return false;
  // Check API-returned paths only. Do not build/encode/rewrite a local resource URL.
  // Legacy saveFile defaults may be opaque store_<name>, not a USER_DATA_PATH child.
  return isUserPath(path) || /^(wxfile|http):\/\/store(?:\/|_)[^?#]+$/.test(path);
}

function initialize() {
  if (initialized) return true;
  try {
    const manager = wx.getFileSystemManager();
    const saved = wx.getStorageSync(STORAGE_KEY);
    // v1 paths were calculated rather than returned by saveFile; never import them.
    const stored = saved && saved.version === 2 && saved.entries;
    const recovered = Object.create(null);
    Object.keys(stored || {}).forEach(fileID => {
      const entry = stored[fileID];
      if (isCloudFileID(fileID) && entry && entry.savedBy === 'saveFile'
        && isSavedPath(entry.localPath) && Number.isFinite(Number(entry.size))
        && Number(entry.size) > 0 && Number(entry.size) <= MAX_CACHE_BYTES) {
        recovered[fileID] = { ...entry, fileID, size: Number(entry.size), lastAccess: Number(entry.lastAccess) || 0 };
      }
    });
    if (!manager) throw new Error('图片缓存文件系统未就绪');
    entries = recovered;
    fileSystem = manager;
    const root = wx.env && wx.env.USER_DATA_PATH;
    cacheDir = root ? `${root.replace(/\/+$/, '')}/image-cache` : '';
    memory.clear();
    restored.clear();
    Object.keys(entries).forEach(fileID => { memory.set(fileID, entries[fileID]); restored.add(fileID); });
    initialized = true;
    log('INIT', `count=${Object.keys(entries).length}`);
    return true;
  } catch (error) {
    // Leave readiness false so a later read can retry; do not clear files/storage.
    log('INIT FAILED', error && (error.errMsg || error.message) || 'cache unavailable');
    return false;
  }
}

function init() {
  if (initPromise) return initPromise;
  // Synchronous storage recovery finishes before returning, so the first page
  // setData can use saved paths. This never waits for or starts a download.
  const ready = initialize();
  const promise = Promise.resolve(ready);
  if (ready) initPromise = promise;
  return promise;
}

function isMissingError(error) {
  const message = typeof error === 'string' ? error : error && (error.errMsg || error.message) || '';
  return /ENOENT|no such file|not exist|not found|不存在|^missing$/i.test(message);
}

function inspectFile(path) {
  if (!fileSystem) return { status: 'unavailable' };
  try { fileSystem.accessSync(path); }
  catch (error) { return { status: isMissingError(error) ? 'missing' : 'unavailable' }; }
  try {
    const result = fileSystem.statSync(path);
    const stats = result && (result.stats || result);
    const size = Number(stats.size);
    if ((typeof stats.isFile === 'function' && !stats.isFile()) || !Number.isFinite(size) || size <= 0) return { status: 'invalid' };
    return { status: 'valid', size };
  } catch (_) { return { status: 'unavailable' }; }
}

function statFile(path) {
  const result = inspectFile(path);
  return result.status === 'valid' ? result : null;
}

function dropMapping(fileID) {
  const entry = entries[fileID];
  delete entries[fileID];
  memory.delete(fileID);
  restored.delete(fileID);
  return entry;
}

function getCachedPath(fileID) {
  if (!isCloudFileID(fileID)) return '';
  if (!initialize()) return '';
  const entry = memory.get(fileID) || entries[fileID];
  if (!entry) { log('MISS', fileID); return ''; }
  const stats = inspectFile(entry.localPath);
  if (stats.status === 'missing') {
    dropMapping(fileID);
    saveIndex(true);
    log('FILE MISSING', fileID);
    return '';
  }
  if (stats.status !== 'valid' || stats.size !== entry.size) {
    // Access/stat failure is not proof the file disappeared. Retain the index
    // for the next check, and do not overwrite it with a new download.
    log('CHECK FAILED', fileID);
    return '';
  }
  log(restored.has(fileID) ? 'PERSISTENT HIT' : 'MEMORY HIT', fileID);
  restored.delete(fileID);
  memory.set(fileID, entry);
  const now = Date.now();
  if (now - (Number(entry.lastAccess) || 0) > ACCESS_TOUCH_INTERVAL_MS) {
    entry.lastAccess = now;
    saveIndex();
  }
  return entry.localPath;
}

function timedOperation(start, abort, lateSuccess) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) { if (!error && lateSuccess) lateSuccess(value); return; }
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {
      try { if (abort) abort(); } catch (_) { /* Always settle, even if abort throws. */ }
      finish(new Error('图片后台缓存超时'));
    }, TIMEOUT_MS);
    try { start(value => finish(null, value), error => finish(error)); }
    catch (error) { finish(error); }
  });
}

function removeSavedPath(path) {
  if (!fileSystem || !isSavedPath(path)) return Promise.resolve(false);
  if (isUserPath(path) && typeof fileSystem.unlinkSync === 'function') {
    try { fileSystem.unlinkSync(path); return Promise.resolve(true); }
    catch (_) { return Promise.resolve(inspectFile(path).status === 'missing'); }
  }
  if (typeof fileSystem.removeSavedFile === 'function') {
    return timedOperation((success, fail) => fileSystem.removeSavedFile({ filePath: path, success, fail }))
      .then(() => true, () => inspectFile(path).status === 'missing');
  }
  try { fileSystem.unlinkSync(path); return Promise.resolve(true); }
  catch (_) { return Promise.resolve(inspectFile(path).status === 'missing'); }
}

function invalidate(fileID) {
  if (!isCloudFileID(fileID)) return;
  if (!initialize()) return;
  revisions.set(fileID, (revisions.get(fileID) || 0) + 1);
  inflight.delete(fileID);
  queued.delete(fileID);
  const entry = dropMapping(fileID);
  saveIndex(true);
  if (entry) removeSavedPath(entry.localPath);
  log('INVALID', fileID);
}

function clearInvalidCache() {
  if (!initialize()) return;
  let changed = false;
  Object.keys(entries).forEach(fileID => {
    const entry = entries[fileID];
    if (inspectFile(entry.localPath).status === 'missing') {
      dropMapping(fileID);
      log('FILE MISSING', fileID);
      changed = true;
    }
  });
  if (changed) saveIndex(true);
}

async function evictForSpace(incomingSize) {
  const oldest = Object.values(entries).sort((a, b) => a.lastAccess - b.lastAccess);
  let total = oldest.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of oldest) {
    if (total + incomingSize <= MAX_CACHE_BYTES) return true;
    if (await removeSavedPath(entry.localPath)) {
      total -= entry.size;
      dropMapping(entry.fileID);
    }
  }
  return total + incomingSize <= MAX_CACHE_BYTES;
}

function isCurrent(job) {
  return job.generation === generation && job.revision === (revisions.get(job.fileID) || 0);
}

function downloadFile(fileID) {
  let task;
  return timedOperation((success, fail) => {
    log('DOWNLOAD', fileID);
    task = wx.cloud.downloadFile({ fileID, success, fail });
    if (task && typeof task.then === 'function') task.then(success, fail);
  }, () => { if (task && typeof task.abort === 'function') task.abort(); });
}

function savedDestination(fileID) {
  if (!cacheDir) throw new Error('持久图片目录未就绪');
  try { fileSystem.accessSync(cacheDir); }
  catch (error) {
    if (!isMissingError(error)) throw error;
    fileSystem.mkdirSync(cacheDir, true);
  }
  // Filename only; the cache key remains the exact original cloud fileID.
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < fileID.length; index += 1) {
    const code = fileID.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  const extension = (fileID.match(/\.(png|jpe?g|webp|gif|bmp)$/i) || [])[1] || 'img';
  return `${cacheDir}/${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}.${extension.toLowerCase()}`;
}

async function downloadAndSave(job) {
  if (!fileSystem || !isCurrent(job)) return job.fileID;
  const cached = getCachedPath(job.fileID);
  if (cached) return cached;
  if (entries[job.fileID]) return job.fileID; // Existing but temporarily uncheckable: no re-download.
  const downloaded = await downloadFile(job.fileID);
  if (!isCurrent(job) || !downloaded || !downloaded.tempFilePath) return job.fileID;
  const tempStats = statFile(downloaded.tempFilePath);
  if (!tempStats || tempStats.size > MAX_CACHE_BYTES) return job.fileID;
  const commit = commitQueue.then(async () => {
    if (!isCurrent(job)) return job.fileID;
    if (!await evictForSpace(tempStats.size)) return job.fileID;
    saveIndex(true);
    const filePath = savedDestination(job.fileID);
    const saved = await timedOperation((success, fail) => fileSystem.saveFile({
      tempFilePath: downloaded.tempFilePath, filePath, success, fail,
    }), null, result => { if (result && result.savedFilePath) removeSavedPath(result.savedFilePath); });
    const savedFilePath = saved && saved.savedFilePath;
    if (!isSavedPath(savedFilePath) || savedFilePath === downloaded.tempFilePath) return job.fileID;
    try {
      // Save success is not enough: verify the exact returned file exists before indexing it.
      await timedOperation((success, fail) => fileSystem.access({ path: savedFilePath, success, fail }));
      const savedStats = statFile(savedFilePath);
      if (!isCurrent(job) || !savedStats || savedStats.size !== tempStats.size) throw new Error('缓存文件校验失败');
      entries[job.fileID] = {
        fileID: job.fileID, localPath: savedFilePath, savedBy: 'saveFile',
        size: savedStats.size, lastAccess: Date.now(),
      };
      if (!saveIndex(true)) { dropMapping(job.fileID); throw new Error('缓存索引保存失败'); }
      memory.set(job.fileID, entries[job.fileID]);
      restored.delete(job.fileID);
      log('SAVED', job.fileID);
      return savedFilePath;
    } catch (error) {
      await removeSavedPath(savedFilePath);
      throw error;
    }
  });
  commitQueue = commit.catch(() => {});
  return commit;
}

function drainDownloads() {
  queueTimer = null;
  while (activeDownloads < MAX_CONCURRENT && downloadQueue.length) {
    const job = downloadQueue.shift();
    if (inflight.get(job.fileID) === job.promise) queued.delete(job.fileID);
    if (!isCurrent(job)) { job.resolve(job.fileID); continue; }
    activeDownloads += 1;
    downloadAndSave(job).catch(error => {
      log('CACHE FAILED', job.fileID, error && (error.errMsg || error.message) || 'unknown error');
      return job.fileID;
    })
      .then(job.resolve).finally(() => {
        if (inflight.get(job.fileID) === job.promise) inflight.delete(job.fileID);
        activeDownloads -= 1;
        drainDownloads();
      });
  }
}

function queueCache(fileID) {
  if (!isCloudFileID(fileID)) return Promise.resolve(fileID);
  const cached = getCachedPath(fileID);
  if (cached) return Promise.resolve(cached);
  if (!initialized || entries[fileID]) return Promise.resolve(fileID);
  if (queued.has(fileID) || inflight.has(fileID)) return inflight.get(fileID);
  if (!fileSystem) return Promise.resolve(fileID);
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const job = { fileID, resolve, promise, generation, revision: revisions.get(fileID) || 0 };
  inflight.set(fileID, promise);
  queued.add(fileID);
  downloadQueue.push(job);
  log('QUEUE', fileID);
  // Give the image component the first render/network turn; this Promise is background-only.
  if (!queueTimer) queueTimer = setTimeout(drainDownloads, QUEUE_DELAY_MS);
  return promise;
}

function queueCaches(fileIDs = []) {
  return Promise.all(Array.from(new Set(fileIDs.filter(Boolean))).map(queueCache));
}

function getDisplayImage(source, fallback = DEFAULT_COVER) {
  return isCloudFileID(source) ? (getCachedPath(source) || source) : (source || fallback);
}

function resolveImage(fileID) {
  const display = getDisplayImage(fileID);
  if (isCloudFileID(fileID) && display === fileID) queueCache(fileID);
  // Never wait for download/save: callers can await this without blocking on the cache queue.
  return Promise.resolve(display);
}

function resolveImages(fileIDs = []) {
  return Promise.all(fileIDs.map(resolveImage));
}

function clearAllImageCache() {
  if (!initialize()) return Promise.resolve([]);
  generation += 1;
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = null;
  downloadQueue.splice(0).forEach(job => job.resolve(job.fileID));
  inflight.clear();
  queued.clear();
  const savedEntries = Object.values(entries);
  entries = Object.create(null);
  memory.clear();
  restored.clear();
  saveIndex(true);
  // Delete only API-saved files tracked by this v2 index, never unrelated user files.
  return Promise.all(savedEntries.map(entry => removeSavedPath(entry.localPath)));
}

function flushIndex() {
  return initialized ? saveIndex(true) : false;
}

function getDebugInfo() {
  initialize();
  const values = Object.values(entries || {});
  let existingFileCount = 0;
  let invalidCount = 0;
  let unavailableCount = 0;
  values.forEach(entry => {
    const result = inspectFile(entry.localPath);
    if (result.status === 'valid' && result.size === entry.size) existingFileCount += 1;
    else if (result.status === 'missing' || result.status === 'invalid' || result.status === 'valid') invalidCount += 1;
    else unavailableCount += 1;
  });
  // Diagnostics are read-only: no deletion, downloads, TTL or access-time changes.
  return { initialized, memoryCount: memory.size, persistentCount: values.length,
    existingFileCount, invalidCount, unavailableCount, cacheDir };
}

function readPath(data, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((value, key) => value && value[key], data);
}

function matchingBindings(owner, view, source, currentSrc) {
  return Array.from(view.bindings.entries()).filter(([target, binding]) => binding.source === source
    && readPath(owner.data, binding.sourcePath) === source
    && (currentSrc === undefined || readPath(owner.data, target) === currentSrc));
}

function handleImageError(owner, source, fallback = DEFAULT_COVER, currentSrc) {
  const view = views.get(owner);
  if (!view) return;
  const bindings = matchingBindings(owner, view, source, currentSrc);
  if (!bindings.length) return; // Ignore a late error from an old image/source.
  const localFailure = isCloudFileID(source) && bindings.some(([target]) => isSavedPath(readPath(owner.data, target)));
  const patch = {};
  if (localFailure && !view.fallbacks.has(source)) {
    view.fallbacks.add(source);
    invalidate(source);
    matchingBindings(owner, view, source).forEach(([target, binding]) => {
      if (readPath(owner.data, target) !== source) patch[target] = source;
      binding.display = source;
    });
    queueCache(source);
    log('FALLBACK', source);
  } else {
    view.failed.add(source);
    bindings.forEach(([target, binding]) => {
      const targetFallback = binding.fallback === undefined ? fallback : binding.fallback;
      if (readPath(owner.data, target) !== targetFallback) patch[target] = targetFallback;
      binding.display = targetFallback;
    });
  }
  if (Object.keys(patch).length) owner.setData(patch);
}

function refreshView(owner, fileIDs = []) {
  const view = views.get(owner);
  if (!view || !fileIDs.length) return;
  const selected = new Set(fileIDs);
  const patch = {};
  const missing = new Set();
  // Explicit next-entry refresh, limited to visible covers. Background completion never calls this.
  view.bindings.forEach((binding, target) => {
    if (!selected.has(binding.source) || readPath(owner.data, binding.sourcePath) !== binding.source) return;
    view.failed.delete(binding.source);
    view.fallbacks.delete(binding.source);
    const display = getDisplayImage(binding.source, binding.fallback);
    if (isCloudFileID(binding.source) && display === binding.source) missing.add(binding.source);
    if (readPath(owner.data, target) !== display) patch[target] = display;
    binding.display = display;
  });
  if (Object.keys(patch).length) owner.setData(patch);
  missing.forEach(queueCache);
}

function setImageData(owner, data, callback, options = {}) {
  let view = views.get(owner);
  if (!view) {
    view = { bindings: new Map(), fallbacks: new Set(), failed: new Set() };
    views.set(owner, view);
  }
  const requests = new Set();
  const bind = (object, key, sourceKey, source, path, fallback, allowQueue = true) => {
    const target = path ? `${path}.${key}` : key;
    const sourcePath = path ? `${path}.${sourceKey}` : sourceKey;
    const previous = view.bindings.get(target);
    // Repeated business setData must not replace a currently displayed cloud src after a save.
    const keepCurrent = previous && previous.source === source && readPath(owner.data, sourcePath) === source;
    const current = keepCurrent && readPath(owner.data, target);
    const localStillValid = isCloudFileID(source) && isSavedPath(current)
      ? getCachedPath(source) === current : true;
    const display = !localStillValid ? source : typeof current === 'string' ? current : getDisplayImage(source, fallback);
    object[key] = view.failed.has(source) ? fallback : display;
    view.bindings.set(target, { source, sourcePath, fallback, display: object[key] });
    if (options.queue !== false && allowQueue && isCloudFileID(source) && !view.failed.has(source)) requests.add(source);
  };
  const decorate = (value, path) => {
    if (Array.isArray(value)) return value.map((item, index) => decorate(item, `${path}[${index}]`));
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return value;
    const result = { ...value };
    Object.keys(value).forEach(key => {
      if (['displayCover', 'displayImage', 'displayImages', 'displayIconImage', 'displayFormIconImage', 'cachedDisplayIcon'].includes(key)) return;
      if (!options.details && (key === 'images' || key === 'steps')) return;
      result[key] = decorate(value[key], path ? `${path}.${key}` : key);
    });
    if ('cover' in value || 'legacyCover' in value) {
      const sourceKey = value.cover ? 'cover' : value.legacyCover ? 'legacyCover' : 'image';
      bind(result, 'displayCover', sourceKey, value[sourceKey], path, DEFAULT_COVER);
    }
    if ('image' in value) bind(result, 'displayImage', 'image', value.image, path, value.image ? DEFAULT_COVER : '');
    if ('iconImage' in value) bind(result, 'displayIconImage', 'iconImage', value.iconImage, path, '', options.icons === true);
    if ('displayIcon' in value) bind(result, 'cachedDisplayIcon', 'displayIcon', value.displayIcon, path, '', options.icons === true);
    if ('formIconImage' in value) bind(result, 'displayFormIconImage', 'formIconImage', value.formIconImage, path, '');
    if (options.details && Array.isArray(value.images)) {
      result.displayImages = value.images.map((source, index) => {
        const object = {};
        bind(object, `displayImages[${index}]`, `images[${index}]`, source, path, DEFAULT_COVER);
        return object[`displayImages[${index}]`];
      });
    }
    return result;
  };
  const initial = decorate(data, '');
  Object.keys(data).forEach(key => {
    const match = key.match(/^(.*\.)(cover|image|images)$/);
    if (!match) return;
    const projected = decorate({ [match[2]]: data[key] }, match[1].slice(0, -1));
    Object.keys(projected).filter(field => field.startsWith('display')).forEach(field => { initial[`${match[1]}${field}`] = projected[field]; });
  });
  owner.setData(initial, callback);
  // No then(setData), no local src replacement when any background job finishes.
  requests.forEach(queueCache);
}

function releaseView(owner) { views.delete(owner); }

module.exports = {
  MAX_CACHE_BYTES, MAX_CONCURRENT, STORAGE_KEY, clearAllImageCache, clearInvalidCache,
  init, getDebugInfo, flushIndex,
  getCachedPath, getCachedImage: getCachedPath, getDisplayImage, handleImageError,
  invalidate, queueCache, queueCaches, preloadImages: queueCaches, refreshView,
  releaseView, resolveImage, resolveImages, setImageData,
  imageEventHandlers: {
    onCachedImageError(event) {
      const data = event.currentTarget.dataset;
      const fallback = Object.prototype.hasOwnProperty.call(data, 'fallback') ? data.fallback : DEFAULT_COVER;
      handleImageError(this, data.cover, fallback, data.src);
    },
    onCachedImageLoad(event) { queueCache(event.currentTarget.dataset.cover); },
  },
  setDebugLogging(enabled) { debugLogging = Boolean(enabled); },
};
