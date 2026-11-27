# 文档索引工作流

点击「运行工作流」，数据包会从文档接入节点出发，依次经过内容解析和索引写入。拖动已连接的插口可以拔线，再拖回可恢复连接。

- [app.js](./app.js) 组织 Vue Flow 节点与拖拽交互。
- [workflow.js](./workflow.js) 管理处理阶段、连接状态和数据包时间轴。
- [wires.js](./wires.js) 以 WebGL 绘制连线和插口，并提供 Canvas 2D 回退。
- [vendor](./vendor/) 包含 Vue、Vue Flow 及其许可证。

[在线体验](https://yogupro.github.io/open-motion/11-anuar-node-connections/index.html)
