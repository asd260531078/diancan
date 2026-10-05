// 可选的素材导出工具，不被小程序引用。需要本机已有 sharp，可用环境变量指定位置。
const fs = require('fs');
const path = require('path');
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'images/home-decoration');
const wood = fs.readFileSync(path.join(root, 'images/izakaya-wood-texture-compact.jpg')).toString('base64');

Promise.all(['cat-body', 'cat-paw', 'lantern', 'wood-plaque', 'eave', 'foliage'].map(async name => {
  const svg = fs.readFileSync(path.join(directory, 'source', `${name}.svg`), 'utf8')
    .replace('__WOOD_TEXTURE__', `data:image/jpeg;base64,${wood}`);
  const file = path.join(directory, `${name}.png`);
  // 保留完整 alpha，避免调色板量化把透明背景抬成低透明度色块。
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toFile(file);
  console.log(`${name}.png: ${fs.statSync(file).size} bytes`);
})).catch(error => { console.error(error); process.exitCode = 1; });
