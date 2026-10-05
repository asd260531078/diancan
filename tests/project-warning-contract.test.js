const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function filesUnder(relativeDir, extension) {
  const directory = path.join(root, relativeDir);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return filesUnder(relative, extension);
    return entry.name.endsWith(extension) ? [relative] : [];
  });
}

const appConfig = JSON.parse(read('app.json'));
appConfig.pages.forEach(pagePath => {
  ['.js', '.wxml', '.wxss'].forEach(extension => {
    assert.ok(fs.existsSync(path.join(root, `${pagePath}${extension}`)), `${pagePath}${extension} must exist`);
  });
});

const wxmlFiles = ['pages', 'components', 'package-order', 'package-admin', 'package-extra']
  .flatMap(directory => filesUnder(directory, '.wxml'));
wxmlFiles.forEach(wxmlFile => {
  const wxml = read(wxmlFile);
  const jsFile = wxmlFile.replace(/\.wxml$/, '.js');
  const js = fs.existsSync(path.join(root, jsFile)) ? read(jsFile) : '';
  const cacheImport = js.match(/const imageCache = require\(['"]([^'"]+)['"]\)/);
  const sharedHandlers = cacheImport && js.includes('...imageCache.imageEventHandlers')
    ? fs.readFileSync(path.resolve(root, path.dirname(jsFile), `${cacheImport[1]}.js`), 'utf8') : '';
  const bindings = [...wxml.matchAll(/(?:bind|catch)[a-z-]+\s*=\s*["']([A-Za-z_$][\w$]*)["']/g)];
  bindings.forEach(([, handler]) => {
    const declaration = new RegExp(`\\b${handler}\\s*\\(`);
    const sharedImageHandler = ['onCachedImageError', 'onCachedImageLoad'].includes(handler)
      && declaration.test(sharedHandlers);
    assert.ok(declaration.test(js) || sharedImageHandler, `${wxmlFile} references missing handler ${handler}`);
  });
  [...wxml.matchAll(/<image\b[^>]*>/g)].forEach(([tag]) => {
    if (!/src=['"][^'"]*(displayCover|displayImage|displayIconImage|displayImages|cachedDisplayIcon|displayFormIconImage)/.test(tag)) return;
    assert.ok(/binderror=/.test(tag), `${wxmlFile} cached images require error fallback`);
    assert.ok(/data-cover=/.test(tag) && /data-src=/.test(tag), `${wxmlFile} must pass original source and rendered src`);
  });
  assert.ok(!/wx:key\s*=\s*["']{{/.test(wxml), `${wxmlFile} must not interpolate wx:key`);
});

const menuWxml = read('pages/menu/menu.wxml');
assert.ok(/class=['"]popular-list['"][^>]*enable-flex/.test(menuWxml), 'flex scroll-view must enable flex layout');

const appJs = read('app.js');
const dishEdit = read('package-admin/dish-edit/dish-edit.js');
assert.ok(!appJs.includes('wx.getUserInfo'), 'deprecated wx.getUserInfo must not be used');
assert.ok(!dishEdit.includes('wx.chooseImage'), 'deprecated wx.chooseImage must not be used');
assert.ok(dishEdit.includes('wx.chooseMedia'), 'image selection must use wx.chooseMedia');

const loadingFiles = ['package-admin/dish-edit/dish-edit.js', 'package-admin/manage/manage.js'];
loadingFiles.forEach(file => {
  const source = read(file);
  const shown = (source.match(/wx\.showLoading\s*\(/g) || []).length;
  const hidden = (source.match(/wx\.hideLoading\s*\(/g) || []).length;
  assert.strictEqual(hidden, shown, `${file} showLoading/hideLoading count must match`);
});
assert.strictEqual((dishEdit.match(/finally\s*\{\s*wx\.hideLoading\s*\(/g) || []).length, 4);

console.log('project-warning contract tests passed');
