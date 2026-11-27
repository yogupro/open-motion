# 进度线的暂停与回弹

暂停时，进度线靠近端点的位置折出凹槽。继续时，端点从原进度前进，折痕同时展开，播放进度与线条形状分别过渡。

[界面源码](./index.html) 用 SVG 路径绘制进度线，用弹簧分别驱动凹槽的深度与宽度。暂停和继续共享同一条动画时间轴。

[在线体验](https://yogupro.github.io/open-motion/08-kippe-progress-motion/index.html)
