# 抠图粒子消散与高光描边

点按柠檬照片或按空格可重播抠图过程。背景变成方块散开，主体抬起并显出贴纸白边，流光沿轮廓移动。完整粒子效果使用 WebGL 2。

- [index.html](./index.html) 组织照片、主体和画布，加载轮廓数据。
- [engine.js](./engine.js) 负责粒子模拟、着色器和轮廓高光。
- [assets](./assets/) 包含照片、透明主体和轮廓坐标。

[在线体验](https://yogupro.github.io/open-motion/09-cutout-particles-webgl/index.html)
