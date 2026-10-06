const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../services/imageCache.js'), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createHarness(root = 'wxfile://usr') {
  const state = {
    files: new Map(), directories: new Set([root]), storage: new Map(), downloads: [], saves: [], accessChecks: [], timers: new Set(),
    logs: [], storageReads: 0, savedPathOverride: '', failStorageRead: false, failFileSystem: false,
    unavailableAccess: false, unavailableStat: false, wrappedStats: false,
    pendingDownloads: new Map(), pendingSaves: [], size: 1024, active: 0, maxActive: 0, serial: 0,
    holdDownloads: false, holdSaves: false, failDownload: false, failSave: false,
    missingSavedFile: false, failAccess: false, failStorage: false, abortThrows: false,
  };
  state.finishDownload = fileID => {
    const pending = state.pendingDownloads.get(fileID);
    if (!pending) return;
    state.pendingDownloads.delete(fileID);
    state.active -= 1;
    if (state.failDownload) return pending.fail(new Error('offline'));
    state.files.set(pending.temp, state.size);
    pending.success({ tempFilePath: pending.temp });
  };
  state.finishSave = () => {
    const pending = state.pendingSaves.shift();
    if (!pending) return;
    if (state.failSave) return pending.fail(new Error('save failed'));
    if (!state.missingSavedFile) state.files.set(pending.saved, state.files.get(pending.tempFilePath));
    state.files.delete(pending.tempFilePath);
    pending.success({ savedFilePath: pending.saved });
  };
  state.clearTimers = () => {
    state.timers.forEach(timer => clearTimeout(timer));
    state.timers.clear();
  };
  state.load = () => {
    state.clearTimers(); // A restart discards the old JS context/timers, not storage/files.
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, console: { log: (...values) => state.logs.push(values) },
      require(name) {
        assert.strictEqual(name, './image');
        return { isCloudFileID: value => typeof value === 'string' && value.startsWith('cloud://') };
      },
      Date: { now: () => ++state.serial },
      wx: {
        env: { USER_DATA_PATH: root },
        getStorageSync: key => {
          state.storageReads += 1;
          if (state.failStorageRead) throw new Error('storage temporarily unavailable');
          return state.storage.get(key);
        },
        setStorageSync(key, value) {
          if (state.failStorage) throw new Error('storage full');
          state.storage.set(key, JSON.parse(JSON.stringify(value)));
        },
        getFileSystemManager: () => {
          if (state.failFileSystem) throw new Error('file system temporarily unavailable');
          return {
          accessSync(file) {
            if (state.unavailableAccess) throw new Error('accessSync:fail temporarily unavailable');
            if (!state.files.has(file) && !state.directories.has(file)) throw new Error('missing');
          },
          mkdirSync(directory) { state.directories.add(directory); },
          access({ path: file, success, fail }) {
            state.accessChecks.push(file);
            Promise.resolve().then(() => state.files.has(file) && !state.failAccess ? success({}) : fail(new Error('missing')));
          },
          statSync(file) {
            if (state.unavailableStat) throw new Error('statSync:fail temporarily unavailable');
            if (!state.files.has(file)) throw new Error('missing');
            const stats = { size: state.files.get(file), isFile: () => true };
            return state.wrappedStats ? { stats } : stats;
          },
          saveFile(options) {
            assert.ok(options.filePath.startsWith(`${root}/image-cache/`), 'request a persistent USER_DATA_PATH destination');
            state.saves.push(options);
            state.pendingSaves.push({ ...options, saved: state.savedPathOverride || options.filePath });
            if (!state.holdSaves) Promise.resolve().then(state.finishSave);
          },
          removeSavedFile({ filePath, success }) { state.files.delete(filePath); success({}); },
          unlinkSync(file) { state.files.delete(file); },
          };
        },
        cloud: {
          downloadFile({ fileID, success, fail }) {
            state.downloads.push(fileID);
            state.active += 1;
            state.maxActive = Math.max(state.maxActive, state.active);
            state.pendingDownloads.set(fileID, { success, fail, temp: `wxfile://tmp/${state.downloads.length}.png` });
            if (!state.holdDownloads) Promise.resolve().then(() => state.finishDownload(fileID));
            return { abort() {
              if (state.pendingDownloads.delete(fileID)) state.active -= 1;
              if (state.abortThrows) throw new Error('abort failed');
            } };
          },
        },
      },
      setTimeout(callback, ms) {
        const delay = ms === 20000 ? 100 : ms === 250 ? 5 : ms;
        const timer = setTimeout(() => { state.timers.delete(timer); callback(); }, delay);
        state.timers.add(timer);
        return timer;
      },
      clearTimeout(timer) { clearTimeout(timer); state.timers.delete(timer); },
    });
    return module.exports;
  };
  return state;
}

function createView() {
  return {
    data: {}, patches: [],
    setData(patch, callback) {
      this.patches.push(patch);
      Object.entries(patch).forEach(([key, value]) => {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        let object = this.data;
        parts.slice(0, -1).forEach(part => { object = object[part] ||= {}; });
        object[parts[parts.length - 1]] = value;
      });
      if (callback) callback();
    },
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 60 && !predicate(); attempt += 1) await wait(2);
  assert.ok(predicate(), 'expected background operation did not start');
}

const harnesses = [];
async function run() {
  const state = createHarness();
  harnesses.push(state);
  let cache = state.load();
  const fileID = 'cloud://env/dish/a.png';
  const placeholder = '/images/default-dish.png';
  assert.strictEqual(await cache.resolveImage(''), placeholder);
  assert.strictEqual(await cache.resolveImage('https://example.com/a.png'), 'https://example.com/a.png');
  state.holdDownloads = true;
  assert.strictEqual(await cache.resolveImage(fileID), fileID, 'a MISS must resolve before download starts');
  assert.strictEqual(state.downloads.length, 0);
  const pending = cache.queueCache(fileID);
  assert.strictEqual(pending, cache.queueCache(fileID), 'queued/active jobs share one Promise');
  await waitFor(() => state.downloads.length === 1);
  state.holdSaves = true;
  state.finishDownload(fileID);
  await waitFor(() => state.pendingSaves.length === 1);
  assert.ok(!state.storage.get(cache.STORAGE_KEY).entries[fileID], 'never index before save succeeds');
  state.finishSave();
  const localA = await pending;
  assert.ok(localA.startsWith('wxfile://usr/image-cache/'));
  assert.ok(state.accessChecks.includes(localA), 'post-save access checks the exact API result');
  assert.strictEqual(state.storage.get(cache.STORAGE_KEY).entries[fileID].localPath, localA);

  cache = state.load();
  state.failDownload = true;
  assert.strictEqual(await cache.resolveImage(fileID), localA, 'restart/offline reuses saved path');
  assert.strictEqual(state.downloads.length, 1);
  const order = createView();
  cache.setImageData(order, { order: { items: [{ cover: fileID }, { cover: '' }, {}] } });
  assert.strictEqual(order.data.order.items[0].cover, fileID);
  assert.strictEqual(order.data.order.items[0].displayCover, localA, 'menu/orders share full fileID index');
  assert.strictEqual(order.data.order.items[1].displayCover, placeholder);
  assert.strictEqual(order.patches.length, 1);
  const invalidBeforeRender = createView();
  cache.setImageData(invalidBeforeRender, { cover: fileID }, null, { queue: false });
  state.files.delete(localA);
  cache.setImageData(invalidBeforeRender, { cover: fileID }, null, { queue: false });
  assert.strictEqual(invalidBeforeRender.data.displayCover, fileID, 'even an unchanged view binding must validate local paths before reuse');
  state.files.set(localA, 1024); // Restore the original fixture to exercise invalid-file handling below.
  const originalEntry = { fileID, localPath: localA, size: 1024, lastAccess: 1, savedBy: 'saveFile' };
  state.storage.set(cache.STORAGE_KEY, { version: 2, entries: { [fileID]: originalEntry } });
  cache = state.load();
  state.failDownload = false;
  state.holdDownloads = false;
  state.holdSaves = false;

  const dishes = ['cloud://env/c.png', 'cloud://env/d.png'];
  const view = createView();
  const before = state.downloads.length;
  cache.setImageData(view, { dishes: dishes.map(cover => ({
    cover, images: ['cloud://env/full.png'], steps: [{ image: 'cloud://env/step.png' }],
  })), categories: [{ displayIcon: 'cloud://env/category.png' }] }, null, { queue: false });
  assert.strictEqual(view.data.dishes[0].displayCover, dishes[0]);
  await cache.queueCaches(dishes);
  assert.strictEqual(state.downloads.length, before + 2);
  assert.strictEqual(view.patches.length, 1, 'saving must not switch src or call setData');
  cache.setImageData(view, { dishes: view.data.dishes }, null, { queue: false });
  assert.strictEqual(view.data.dishes[0].displayCover, dishes[0], 'same-view data updates preserve cloud src');
  cache.refreshView(view, [dishes[0]]);
  const localC = view.data.dishes[0].displayCover;
  assert.ok(state.files.has(localC));
  assert.strictEqual(view.data.dishes[1].displayCover, dishes[1], 'refresh only selected visible covers');

  state.files.delete(localC); // The file can disappear after initial projection.
  cache.handleImageError(view, dishes[0], placeholder, localC);
  assert.strictEqual(view.data.dishes[0].displayCover, dishes[0], 'local error immediately falls back to cloud');
  const patchesAfterFallback = view.patches.length;
  await cache.queueCache(dishes[0]);
  assert.strictEqual(view.patches.length, patchesAfterFallback, 'recovery save must not force another src change');
  cache.handleImageError(view, dishes[0], placeholder, localC); // A late old local error.
  assert.strictEqual(view.patches.length, patchesAfterFallback);
  cache.handleImageError(view, dishes[0], placeholder, dishes[0]);
  assert.strictEqual(view.data.dishes[0].displayCover, placeholder);
  const patchesAtPlaceholder = view.patches.length;
  cache.handleImageError(view, dishes[0], placeholder, placeholder);
  assert.strictEqual(view.patches.length, patchesAtPlaceholder, 'fallback cannot form a render/download loop');
  cache.refreshView(view, [dishes[0]]);
  assert.ok(state.files.has(view.data.dishes[0].displayCover));

  state.files.delete(localA);
  assert.strictEqual(await cache.resolveImage(fileID), fileID);
  assert.ok(!state.storage.get(cache.STORAGE_KEY).entries[fileID]);
  const newLocalA = await cache.queueCache(fileID);
  assert.strictEqual(newLocalA, localA, 'the same cloud fileID has a stable USER_DATA_PATH filename');
  assert.ok(state.files.has(newLocalA), 'a missing file is actually re-saved before reuse');
  const newFileID = 'cloud://env/dish/replacement.png';
  assert.strictEqual(await cache.resolveImage(newFileID), newFileID);
  assert.notStrictEqual(await cache.queueCache(newFileID), newLocalA);

  cache.setImageData(view, { 'form.images': ['cloud://env/gallery.png'] }, null, { details: true });
  const gallerySource = view.data.form.displayImages[0];
  await cache.queueCache(gallerySource);
  assert.strictEqual(view.data.form.displayImages[0], gallerySource);
  assert.strictEqual(view.data.form.images[0], gallerySource);
  cache.releaseView(view);

  for (const failure of ['failDownload', 'failSave', 'missingSavedFile', 'failAccess', 'failStorage']) {
    state[failure] = true;
    const id = `cloud://env/${failure}.png`;
    assert.strictEqual(await cache.resolveImage(id), id);
    assert.strictEqual(await cache.queueCache(id), id);
    assert.ok(!cache.getCachedPath(id), `${failure} must not leave a cached path`);
    state[failure] = false;
  }
  state.holdDownloads = true;
  state.abortThrows = true;
  assert.strictEqual(await cache.queueCache('cloud://env/timeout.png'), 'cloud://env/timeout.png');
  state.holdDownloads = false;
  state.abortThrows = false;
  state.holdSaves = true;
  const lateSave = cache.queueCache('cloud://env/late-save.png');
  await waitFor(() => state.pendingSaves.length === 1);
  const latePath = state.pendingSaves[0].saved;
  assert.strictEqual(await lateSave, 'cloud://env/late-save.png');
  state.finishSave();
  await wait(5);
  assert.ok(!state.files.has(latePath), 'a timed-out save cannot leave an indexed/orphan file');
  state.holdSaves = false;

  const unrelated = 'wxfile://usr/unrelated-user-file.png';
  state.files.set(unrelated, 1024);
  await cache.clearAllImageCache();
  state.size = 20 * 1024 * 1024;
  const oldest = await cache.queueCache('cloud://env/lru/old.png');
  const recent = await cache.queueCache('cloud://env/lru/recent.png');
  await cache.queueCache('cloud://env/lru/new.png');
  assert.ok(!state.files.has(oldest));
  assert.ok(state.files.has(recent));
  assert.ok(Object.values(state.storage.get(cache.STORAGE_KEY).entries).reduce((sum, entry) => sum + entry.size, 0) <= cache.MAX_CACHE_BYTES);
  assert.ok(state.files.has(unrelated));

  state.size = 1024;
  state.holdDownloads = true;
  const cleared = cache.queueCache('cloud://env/cleared.png');
  await waitFor(() => state.pendingDownloads.has('cloud://env/cleared.png'));
  await cache.clearAllImageCache();
  state.finishDownload('cloud://env/cleared.png');
  assert.strictEqual(await cleared, 'cloud://env/cleared.png');
  assert.strictEqual(Object.keys(state.storage.get(cache.STORAGE_KEY).entries).length, 0);
  assert.ok(state.files.has(unrelated));

  const dev = createHarness('http://usr');
  harnesses.push(dev);
  dev.files.set('http://usr/image-cache-v1/old.png', 1024);
  dev.storage.set('family_image_cache_v1', { version: 1, entries: { [fileID]: { localPath: 'http://usr/image-cache-v1/old.png', size: 1024 } } });
  const devCache = dev.load();
  assert.strictEqual(await devCache.resolveImage(fileID), fileID, 'ignore v1 even when its old file exists');
  const devLocal = await devCache.queueCache(fileID);
  assert.ok(devLocal.startsWith('http://usr/image-cache/'), 'preserve developer-tools API paths verbatim');
  assert.strictEqual(await devCache.resolveImage(fileID), devLocal);
  devCache.invalidate(fileID);
  assert.strictEqual(devCache.getCachedPath(fileID), '');

  // Earlier path validation incorrectly rejected legitimate opaque saved paths.
  for (const savedPath of ['wxfile://store_opaque-old.png', 'http://store/opaque-old.png']) {
    const legacy = createHarness(savedPath.startsWith('http') ? 'http://usr' : 'wxfile://usr');
    harnesses.push(legacy);
    legacy.savedPathOverride = savedPath; // Simulate the exact saveFile API return value.
    let legacyCache = legacy.load();
    assert.strictEqual(await legacyCache.queueCache(fileID), savedPath);
    assert.ok(legacy.storage.get(legacyCache.STORAGE_KEY).entries[fileID]);
    legacyCache = legacy.load();
    legacyCache.setDebugLogging(true);
    const ready = legacyCache.init();
    assert.strictEqual(ready, legacyCache.init(), 'successful init has one shared ready Promise');
    assert.strictEqual(legacyCache.getDebugInfo().initialized, true, 'restore completes synchronously, before awaiting ready');
    assert.strictEqual(await ready, true);
    const beforeReads = legacy.storageReads;
    assert.strictEqual(legacyCache.getCachedPath(fileID), savedPath);
    assert.ok(legacy.logs.some(values => values[0] === '[imageCache PERSISTENT HIT]'));
    assert.strictEqual(await legacyCache.queueCache(fileID), savedPath);
    assert.ok(legacy.logs.some(values => values[0] === '[imageCache MEMORY HIT]'));
    assert.strictEqual(legacy.storageReads, beforeReads, 'ordinary hits do not re-read storage');
    assert.strictEqual(legacy.downloads.length, 1, 'cold startup must not redownload a saved opaque path');
  }

  const recovering = createHarness();
  harnesses.push(recovering);
  const persistentPath = 'wxfile://usr/image-cache/from-previous-session.png';
  recovering.files.set(persistentPath, 1024);
  recovering.storage.set('family_image_cache_v2', { version: 2, entries: {
    [fileID]: { fileID, localPath: persistentPath, size: 1024, savedBy: 'saveFile', lastAccess: -10000000000 },
  } });
  const indexBefore = JSON.stringify(recovering.storage.get('family_image_cache_v2'));
  recovering.failStorageRead = true;
  const recoveringCache = recovering.load();
  recoveringCache.setDebugLogging(true);
  assert.strictEqual(await recoveringCache.init(), false);
  assert.strictEqual(recoveringCache.getCachedPath(fileID), '');
  assert.strictEqual(await recoveringCache.queueCache(fileID), fileID);
  recoveringCache.clearInvalidCache();
  assert.strictEqual(recoveringCache.flushIndex(), false);
  assert.strictEqual(JSON.stringify(recovering.storage.get('family_image_cache_v2')), indexBefore,
    'a temporarily unreadable index must never be replaced by an empty map');
  assert.ok(recovering.files.has(persistentPath));
  assert.strictEqual(recovering.downloads.length, 0);
  recovering.failStorageRead = false;
  recovering.failFileSystem = true;
  assert.strictEqual(await recoveringCache.init(), false);
  recovering.failFileSystem = false;
  assert.strictEqual(await recoveringCache.init(), true, 'init retries after API readiness recovers');
  assert.strictEqual(recoveringCache.getDebugInfo().memoryCount, 1);
  assert.strictEqual(recoveringCache.getDebugInfo().persistentCount, 1);
  assert.strictEqual(recoveringCache.getDebugInfo().existingFileCount, 1);
  assert.strictEqual(recoveringCache.getDebugInfo().cacheDir, 'wxfile://usr/image-cache');
  assert.strictEqual(recoveringCache.getCachedPath(fileID), persistentPath, 'old lastAccess does not act as a TTL');
  for (const failure of ['unavailableAccess', 'unavailableStat']) {
    recovering[failure] = true;
    assert.strictEqual(recoveringCache.getCachedPath(fileID), '');
    recoveringCache.clearInvalidCache();
    assert.ok(recovering.storage.get('family_image_cache_v2').entries[fileID], `${failure} is not proof a file is missing`);
    assert.strictEqual(await recoveringCache.queueCache(fileID), fileID);
    assert.strictEqual(recovering.downloads.length, 0, 'do not overwrite an uncheckable existing cache');
    recovering[failure] = false;
  }
  recovering.wrappedStats = true;
  assert.strictEqual(recoveringCache.getCachedPath(fileID), persistentPath);
  recovering.wrappedStats = false;
  const removedPath = 'wxfile://usr/image-cache/system-removed.png';
  // Add a missing record through a fresh module initialization, without deleting the valid file.
  const storedRecovering = recovering.storage.get('family_image_cache_v2');
  storedRecovering.entries['cloud://env/system-removed.png'] = {
    fileID: 'cloud://env/system-removed.png', localPath: removedPath, size: 1024, savedBy: 'saveFile', lastAccess: 1,
  };
  const missingCache = recovering.load();
  missingCache.setDebugLogging(true);
  await missingCache.init();
  const diagnosticSnapshot = JSON.stringify(recovering.storage.get('family_image_cache_v2'));
  assert.strictEqual(missingCache.getDebugInfo().existingFileCount, 1);
  assert.strictEqual(missingCache.getDebugInfo().invalidCount, 1);
  assert.strictEqual(JSON.stringify(recovering.storage.get('family_image_cache_v2')), diagnosticSnapshot, 'diagnostics never write the persistent index');
  assert.ok(recovering.storage.get('family_image_cache_v2').entries['cloud://env/system-removed.png'], 'debug info must not clean files or storage');
  missingCache.clearInvalidCache();
  assert.ok(!recovering.storage.get('family_image_cache_v2').entries['cloud://env/system-removed.png']);
  assert.ok(recovering.storage.get('family_image_cache_v2').entries[fileID]);
  assert.ok(recovering.logs.some(values => values[0] === '[imageCache FILE MISSING]'));
  assert.strictEqual(recovering.downloads.length, 0);

  const concurrent = createHarness();
  harnesses.push(concurrent);
  concurrent.holdDownloads = true;
  const concurrentCache = concurrent.load();
  const ids = Array.from({ length: 6 }, (_, index) => `cloud://env/parallel-${index}.png`);
  const jobs = ids.map(concurrentCache.queueCache);
  assert.strictEqual(jobs[0], concurrentCache.queueCache(ids[0]));
  for (let batch = 0; batch < 3; batch += 1) {
    await waitFor(() => concurrent.pendingDownloads.size === 2);
    [...concurrent.pendingDownloads.keys()].forEach(concurrent.finishDownload);
    await wait(1);
  }
  await Promise.all(jobs);
  assert.strictEqual(concurrent.downloads.length, 6);
  assert.strictEqual(concurrent.maxActive, 2);
  assert.strictEqual(concurrentCache.MAX_CONCURRENT, 2);

  // Run the actual menu page against the real cache module, not a projection stub.
  const menuState = createHarness();
  harnesses.push(menuState);
  const menuCache = menuState.load();
  const menuDishes = Array.from({ length: 40 }, (_, index) => ({
    id: `menu-${index}`, name: `菜品${index}`, type: 'food', categoryId: 'main', enabled: true,
    cover: `cloud://env/menu-${index}.png`, price: 10, recommended: index < 2,
    images: [`cloud://env/full-${index}.png`], steps: [{ image: `cloud://env/step-${index}.png` }],
  }));
  let menu;
  let menuRequests = 0;
  const menuApp = { globalData: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/menu/menu.js'), 'utf8'), {
    Page(config) { menu = config; },
    getApp: () => menuApp,
    console: { error() {} },
    require(name) {
      if (name === '../../services/imageCache') return menuCache;
      if (name === '../../services/catalog') return {
        getCachedCatalog: () => ({ dishes: [], categories: [] }),
        async listDishes() { menuRequests += 1; return { items: menuDishes }; },
        async listCategories() { return { items: [{ id: 'main', name: '自定义分类', icon: 'cloud://env/category.png' }] }; },
        async loadCatalog() {
          menuRequests += 1;
          return { dishes: menuDishes, categories: [{ id: 'main', name: '自定义分类', icon: 'cloud://env/category.png' }] };
        },
        getCatalogRevision: () => 0,
      };
      if (name === '../../services/orders') return { peekFrequentDishIds: () => [], getFrequentDishIds: async () => [] };
      if (name === '../../services/cart') return { loadCart: () => [], getItemCount: () => 0, getTotalAmount: () => 0 };
      return require(path.join(__dirname, '../pages/menu', name));
    },
    wx: { getStorageSync: () => [], showToast() {} },
  });
  const menuView = createView();
  menu.patches = menuView.patches;
  menu.setData = menuView.setData;
  menu.onLoad({ view: 'menu' });
  await menu.loadCatalog();
  assert.strictEqual(menu.activeDishes().length, 40);
  assert.strictEqual(menu.activeDishes()[0].displayCover, menuDishes[0].cover);
  assert.strictEqual(menuState.downloads.length, 0, 'actual menu data is rendered before cache downloads start');
  const renderedPatches = menu.patches.length;
  await menuCache.queueCaches(menuDishes.slice(0, 8).map(dish => dish.cover));
  assert.strictEqual(menuState.downloads.length, 8, 'do not enqueue all 40 dishes, categories or full/step images');
  assert.strictEqual(menu.patches.length, renderedPatches, 'menu src stays unchanged after background completion');
  const sameDishes = menu._dishes;
  await menu.onShow();
  assert.strictEqual(menuRequests, 1);
  assert.strictEqual(menu._dishes, sameDishes);
  assert.strictEqual(menu.activeDishes()[0].displayCover, menuDishes[0].cover);
  await menu.onShow();
  assert.strictEqual(menu.activeDishes()[0].displayCover, menuDishes[0].cover, 'resident menu nodes keep cloud src for this page lifetime');
  assert.strictEqual(menu.activeDishes()[8].displayCover, menuDishes[8].cover);
  menu.onDishImageLoad({ currentTarget: { dataset: { cover: menuDishes[12].cover } } });
  await menuCache.queueCache(menuDishes[12].cover);
  assert.strictEqual(menuState.downloads.length, 9, 'scroll-loaded cover alone joins the background queue');
  assert.strictEqual(menu.activeDishes()[12].displayCover, menuDishes[12].cover);
  await menu.onShow();
  assert.strictEqual(menu.activeDishes()[12].displayCover, menuDishes[12].cover, 'ordinary onShow must not reset an already-mounted src');
  assert.strictEqual(menuState.downloads.length, 9);

  // True cold boot: discard JS memory, preserve only the Wx storage/files, and
  // run the actual App.onLaunch before the actual menu's first image-bearing setData.
  menu.onUnload();
  const coldCache = menuState.load();
  let coldApp;
  let cloudInitCount = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), {
    App(config) { coldApp = config; }, console: { error() {} },
    wx: {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: 'trial' } }),
      getStorageSync: key => menuState.storage.get(key),
      cloud: { init() {
        cloudInitCount += 1;
        assert.strictEqual(coldCache.getDebugInfo().initialized, true, 'persistent restoration precedes cloud/session/page startup');
      } },
    },
    require(name) {
      if (name === './services/imageCache') return coldCache;
      if (name === './config/cloud') return {};
      if (name === './services/auth') return { getSession: async () => ({ openid: 'test', isAdmin: false }) };
      if (name === './services/chef-order-reminder') return { start() {}, stop() {}, reset() {} };
      throw new Error(`unexpected App dependency ${name}`);
    },
  });
  const savedDownloadCount = menuState.downloads.length;
  coldApp.onLaunch();
  assert.strictEqual(coldApp.globalData.imageCacheReady, coldCache.init());
  assert.strictEqual(cloudInitCount, 1);
  assert.strictEqual(coldCache.getDebugInfo().persistentCount, 9);
  assert.strictEqual(coldCache.getDebugInfo().existingFileCount, 9);
  assert.ok(menuState.logs.some(values => values[0] === '[imageCache INIT]' && values[1] === 'count=9'));
  const coldSnapshot = menuDishes;
  let coldMenu;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/menu/menu.js'), 'utf8'), {
    Page(config) { coldMenu = config; }, getApp: () => coldApp, console: { error() {} },
    wx: { getStorageSync: () => [], showToast() {} },
    require(name) {
      if (name === '../../services/imageCache') return coldCache;
      if (name === '../../services/catalog') return {
        getCachedCatalog: () => ({ dishes: coldSnapshot, categories: [{ id: 'main', name: '自定义分类' }] }),
        listDishes: async () => ({ items: coldSnapshot }),
        listCategories: async () => ({ items: [{ id: 'main', name: '自定义分类' }] }),
        loadCatalog: async () => ({ dishes: coldSnapshot, categories: [{ id: 'main', name: '自定义分类' }] }),
        getCatalogRevision: () => 0,
      };
      if (name === '../../services/orders') return { peekFrequentDishIds: () => [], getFrequentDishIds: async () => [] };
      if (name === '../../services/cart') return { loadCart: () => [], getItemCount: () => 0, getTotalAmount: () => 0 };
      return require(path.join(__dirname, '../pages/menu', name));
    },
  });
  const coldView = createView();
  coldMenu.patches = coldView.patches;
  coldMenu.setData = coldView.setData;
  coldMenu.onLoad({ view: 'menu' });
  const firstImagePatch = coldMenu.patches.find(patch => patch.categoryPanels);
  assert.ok(menuState.files.has(firstImagePatch.categoryPanels[0].dishes[0].displayCover),
    'cached cover is local in the FIRST render, never cloud followed by local');
  assert.ok(menuState.files.has(firstImagePatch.categoryPanels[0].dishes[12].displayCover));
  assert.strictEqual(firstImagePatch.categoryPanels[0].dishes[0].cover, coldSnapshot[0].cover, 'keep original cloud cover');
  assert.ok(menuState.logs.some(values => values[0] === '[imageCache PERSISTENT HIT]'));
  const coldPanels = coldMenu.data.categoryPanels;
  await coldMenu.onShow();
  coldApp.onHide();
  coldApp.onShow();
  await coldMenu.onShow();
  assert.strictEqual(coldMenu.data.categoryPanels, coldPanels, 'returning from a page/background keeps panels and src');
  assert.ok(menuState.files.has(coldMenu.activeDishes()[0].displayCover));
  await coldCache.queueCaches(coldSnapshot.slice(0, 8).map(dish => dish.cover));
  assert.strictEqual(menuState.downloads.length, savedDownloadCount, 'cold startup/page return/background return add zero cover downloads');
  let row;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../components/order-item-row/index.js'), 'utf8'), {
    Component(config) { row = config; },
    require(name) { assert.strictEqual(name, '../../services/imageCache'); return coldCache; },
  });
  const coldOrderRow = createView();
  row.properties.item.observer.call(coldOrderRow, { cover: coldSnapshot[0].cover });
  assert.ok(menuState.files.has(coldOrderRow.patches[0].displayCover), 'actual order component shares the persistent file on first render');
  assert.strictEqual(menuState.downloads.length, savedDownloadCount);
  coldMenu.onUnload();
  await coldApp.globalData.sessionReady;
  const residentPanels = menu.data.categoryPanels;
  const originalViews = menu._dishViewCache;
  menu.onCategoryChange({ currentTarget: { dataset: { categoryid: 'main' } } });
  menu.onCategoryChange({ currentTarget: { dataset: { categoryid: 'all' } } });
  menu.onCategoryChange({ currentTarget: { dataset: { categoryid: 'main' } } });
  assert.strictEqual(menu.data.categoryPanels, residentPanels);
  assert.strictEqual(menu._dishViewCache, originalViews);
  assert.ok(menuState.files.has(menu.activeDishes()[0].displayCover), 'a first-visited panel mounts with the saved local file');
  assert.strictEqual(menu.data.categoryPanels[0].dishes[0].displayCover, menuDishes[0].cover, 'resident nodes keep their src');
  assert.strictEqual(menuRequests, 1, 'category switches do not fetch dishes');
  assert.strictEqual(menuState.downloads.length, 9, 'category switches do not enqueue/download covers');
  menu.onUnload();
  menuCache.releaseView(menu);
  // A new page instance may choose validated saved files, unlike a resident node.
  menu.data = { ...menu.data, categoryPanels: [], featuredDishes: [], previewDishes: [] };
  menu._dishes = [];
  menu._dishViewCache = null;
  menu._dishSourceSignatures = null;
  menu.applyCatalogView(menuDishes, [{ id: 'main', name: '自定义分类' }]);
  assert.ok(menuState.files.has(menu.activeDishes()[0].displayCover));
  assert.ok(menuState.files.has(menu.activeDishes()[12].displayCover), 'new page initialization still uses the shared persistent cache');
  assert.strictEqual(menuState.downloads.length, 9);
  console.log('image cache v2 passed: App cold init, persistent/memory diagnostics, USER_DATA_PATH save, opaque path compatibility, transient recovery, first-render local menu/order, immediate MISS render, no src switch, fallback, failures/timeouts, LRU and concurrency=2');
}

run().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => harnesses.forEach(state => state.clearTimers()));
