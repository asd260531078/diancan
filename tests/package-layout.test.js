const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const { MENU_CATEGORY_ICONS } = require('../config/menu-category-icons');
const mainPages = app.pages || [];
const subPackages = app.subPackages || [];
const registeredPages = new Set(mainPages);

assert.deepStrictEqual(mainPages, ['pages/menu/menu', 'pages/profile/profile']);
assert.deepStrictEqual(subPackages.map(pkg => pkg.root), ['package-order', 'package-admin', 'package-extra']);
assert.strictEqual(app.lazyCodeLoading, 'requiredComponents');
assert.strictEqual(project.miniprogramRoot, './');
assert.strictEqual(project.cloudfunctionRoot, 'cloudfunctions/');
assert.strictEqual(Object.keys(MENU_CATEGORY_ICONS).length, 13);
Object.values(MENU_CATEGORY_ICONS).forEach(icon => {
  const file = path.join(root, icon.slice(1));
  const png = fs.readFileSync(file);
  assert.strictEqual(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.strictEqual(png.readUInt32BE(16), 256);
  assert.strictEqual(png.readUInt32BE(20), 256);
  assert(png.includes(Buffer.from('tRNS')), `${icon} lost transparency`);
  assert(png.length < 80 * 1024, `${icon} is too large`);
});

subPackages.forEach(pkg => pkg.pages.forEach(page => registeredPages.add(`${pkg.root}/${page}`)));
assert.strictEqual(registeredPages.size, 15);
registeredPages.forEach(route => {
  ['js', 'json', 'wxml', 'wxss'].forEach(extension => {
    assert(fs.existsSync(path.join(root, `${route}.${extension}`)), `${route}.${extension} is missing`);
  });
  const pageConfig = JSON.parse(fs.readFileSync(path.join(root, `${route}.json`), 'utf8'));
  Object.values(pageConfig.usingComponents || {}).forEach(component => {
    assert(component.startsWith('/'), `relative component path in ${route}`);
    assert(fs.existsSync(path.join(root, `${component.slice(1)}.json`)),
      `missing component ${component} in ${route}`);
  });
  const styleFile = path.join(root, `${route}.wxss`);
  const style = fs.readFileSync(styleFile, 'utf8');
  for (const match of style.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
    assert(fs.existsSync(path.resolve(path.dirname(styleFile), match[1])),
      `missing WXSS import ${match[1]} in ${route}`);
  }
});
(app.tabBar.list || []).forEach(item => assert(mainPages.includes(item.pagePath)));

const runtimeRoots = ['pages', 'package-order', 'package-admin', 'package-extra',
  'components', 'config', 'services', 'utils'];
const scriptFiles = [];
function collectJs(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJs(file);
    else if (entry.name.endsWith('.js')) scriptFiles.push(file);
  });
}
runtimeRoots.forEach(directory => collectJs(path.join(root, directory)));

scriptFiles.forEach(file => {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    assert(fs.existsSync(`${target}.js`) || fs.existsSync(path.join(target, 'index.js')),
      `missing module ${match[1]} in ${path.relative(root, file)}`);
    if (file.startsWith(path.join(root, 'pages') + path.sep)) {
      assert(!target.startsWith(path.join(root, 'package-')),
        `main package imports a subpackage module: ${path.relative(root, file)}`);
    }
  }
  for (const match of source.matchAll(/wx\.(navigateTo|redirectTo|switchTab)\(\s*\{\s*url:\s*['"`]\/([^'"`]+)/g)) {
    const route = match[2].split('?')[0];
    assert(registeredPages.has(route), `unregistered ${match[1]} route /${route} in ${path.relative(root, file)}`);
    if (match[1] === 'switchTab') assert(mainPages.includes(route), `switchTab points to subpackage: ${route}`);
  }
});

console.log('package layout: 2 main pages, 13 subpackage pages, routes and module imports passed');
