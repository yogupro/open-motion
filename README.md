<h1 align="center">
  <img src="./assets/cover.webp" alt="Open Remotion" width="1120">
</h1>

<p align="center"><strong>开源 UI 微交互资料库</strong></p>
<p align="center">从滑块、状态提示到加载与手势确认，每个案例都提供界面源码与动效拆解。</p>
<p align="center">
  <a href="#案例画廊">案例画廊</a> · <a href="#资料索引">资料索引</a> · <a href="./LICENSE">Apache 2.0</a>
</p>

## 案例画廊

<table>
  <tr valign="top">
    <td width="50%">
      <a href="./01-codex-ultra-slider/"><img src="./assets/01-codex-ultra-slider.webp" alt="Codex Ultra 能量滑轨，紫色极光填满轨道" width="480"></a><br>
      <strong>Codex Ultra 能量滑轨</strong><br>
      弹簧旋钮、极光填充与挡位粒子反馈。<br>
      <a href="./01-codex-ultra-slider/">案例资料</a> · <a href="./assets/01-codex-ultra-slider.mp4">MP4 演示</a>
    </td>
    <td width="50%">
      <a href="./02-agent-orb/"><img src="./assets/02-agent-orb.webp" alt="Agent Orb 的点阵地球与状态选择栏" width="480"></a><br>
      <strong>Agent Orb</strong><br>
      用同一个 WebGL 点阵球表达六种 Agent 状态。<br>
      <a href="./02-agent-orb/">案例资料</a> · <a href="./assets/02-agent-orb.mp4">MP4 演示</a>
    </td>
  </tr>
  <tr valign="top">
    <td width="50%">
      <a href="./03-webgl-loading/"><img src="./assets/03-webgl-loading.webp" alt="导出弹窗底部的暖色光带与进度文案" width="480"></a><br>
      <strong>导出光带</strong><br>
      暖色光带上移，文件摘要逐行恢复清晰。<br>
      <a href="./03-webgl-loading/">案例资料</a> · <a href="./assets/03-webgl-loading.mp4">MP4 演示</a>
    </td>
    <td width="50%">
      <a href="./04-swipe-send/"><img src="./assets/04-swipe-send.webp" alt="上滑转账的深色确认界面与发光确认按钮" width="480"></a><br>
      <strong>上滑转账</strong><br>
      上滑越过确认阈值，松手后衔接光箭与折射回执。<br>
      <a href="./04-swipe-send/">案例资料</a> · <a href="./assets/04-swipe-send.mp4">MP4 演示</a>
    </td>
  </tr>
</table>

## 资料索引

| 案例 | 界面源码 | 原理笔记 |
| --- | --- | --- |
| Codex Ultra 能量滑轨 | [单文件 HTML](./01-codex-ultra-slider/codex-ultra-slider.html) | [微交互原理速查手册](./01-codex-ultra-slider/Codex-Ultra-微交互原理速查手册.md) |
| Agent Orb | [界面与着色器](./02-agent-orb/index.html) · [点阵数据](./02-agent-orb/particles.js) | [六种状态与过渡](./02-agent-orb/README.md) |
| 导出光带 | [单文件 HTML](./03-webgl-loading/index.html) | [微交互原理速查手册](./03-webgl-loading/导出光带-微交互原理速查手册.md) |
| 上滑转账 | [界面入口](./04-swipe-send/index.html) · [手势与动效](./04-swipe-send/motion.js) · [光效渲染](./04-swipe-send/renderer.js) | [微交互原理速查手册](./04-swipe-send/上滑转账-微交互原理速查手册.md) |

[有谷 Yogu](https://yogu.pro) 维护 · [Apache License 2.0](./LICENSE)
