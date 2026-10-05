// 只影响首页装饰。可直接替换 PNG 路径；整只猫使用 GIF 时填写 animatedSrc。
module.exports = {
  heightRpx: 200,
  eave: { src: '/images/home-decoration/eave.png' },
  foliage: { src: '/images/home-decoration/foliage.png' },
  lantern: { src: '/images/home-decoration/lantern.png', caption: ['食', '堂'] },
  plaque: { src: '/images/home-decoration/wood-plaque.png', caption: ['小', '高', '手', '作'] },
  cat: {
    bodySrc: '/images/home-decoration/cat-body.png',
    pawSrc: '/images/home-decoration/cat-paw.png',
    animatedSrc: '',
    widthPercent: 36,
    heightPercent: 51,
    rightPercent: 0,
    // 手臂按身体画布的百分比定位，替换素材时可调整肩部关节位置。
    paw: { left: 70, top: 25, width: 30, height: 45.45, origin: '18% 90%' },
    waveDurationMs: 2800,
  },
  greeting: '今天也要好好吃饭',
};
