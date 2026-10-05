# 首页迎客装饰

仅用于 `components/home-decoration`，资源和定位参数集中在 `config/home-decoration.js`。

- 灯笼：`images/home-decoration/lantern.png`，透明底；“食堂”由 WXML 文字覆盖。
- 小屋檐：`images/home-decoration/eave.png`，2D 茶棕木梁及两个挂点。
- 枝叶樱花：`images/home-decoration/foliage.png`，独立透明底点缀。
- 吊牌：`images/home-decoration/wood-plaque.png`，沿用已有居酒屋木纹；“小高手作”和底部“暖”章由 WXML 文字覆盖。
- 猫身体：`images/home-decoration/cat-body.png`，透明 200 × 220 画布。
- 招手臂：`images/home-decoration/cat-paw.png`，透明 60 × 100 画布；关节位置由 `cat.paw` 的百分比和 `origin` 指定。

直接替换 PNG 或修改配置中的路径即可。若新图自带文字，将对应 `caption` 设为 `[]`。使用一体 GIF 时设置 `cat.animatedSrc`，组件自动跳过分层手臂；`bodySrc` 作为静态备用。调整 `widthPercent` / `heightPercent` 时保持素材比例，猫当前占装饰高度的 51%。

默认只让手臂以 2.8 秒周期缓慢摆动。页面隐藏时暂停 WXSS 动画；离开“食堂”视图时组件销毁。整只 GIF 在页面隐藏时卸载。没有定时器、网络请求或业务数据写入。点击猫仅显示欢迎 Toast。

`source/*.svg` 是可编辑矢量源。开发时可运行 `scripts/export-home-decoration.js` 导出透明 PNG（本机需已有 sharp，或通过 `SHARP_MODULE_PATH` 指定；小程序无该依赖）。木牌导出复用当前木纹源文件。无需运行此脚本即可直接更换 PNG。
