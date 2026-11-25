# Codex Ultra 能量滑轨（253 行零依赖）微交互原理速查手册

> 配套源码：同目录下的 `codex-ultra-slider.html`（零第三方依赖，双击直接用浏览器打开即可体验 60fps 实机交互）。

---

## 一、核心架构：7 层视觉合成栈

整个面板仅 `254×97px`，核心交互区 `.control` 为 `231×28px`，内部一条 `24px` 高胶囊轨道沿 Z 轴清晰拆分为 7 层：

| 层级 | DOM 元素 | 职责 |
| --- | --- | --- |
| L1 | `.track` + `.ticks` + 隐形 `<input type="range">` | 灰色底轨、5 档刻度点（伪元素热区 `16×16px`）、键盘方向键与读屏无障碍语义 |
| L2 | `.fill` | 永远保持 100% 宽度，通过 `clip-path: inset(...)` 在合成器阶段裁剪右侧 |
| L3 | `.Mask-tydFov` 底板 | CSS 蓝紫渐变品牌底色 + `isolation: isolate` 锁定混合边界 |
| L4 | `<canvas class="Canvas-bwIFs3">` | WebGL 1.0 12 节点高斯 RBF 动态光场，叠加 `mix-blend-mode: luminosity` |
| L5 | `.Mask-tydFov` 遮罩 | Houdini `@property` 驱动 120px 羽化 `mask-image` 从右向左 2 秒揭幕 |
| L6 | `.TrackParticles` / `.FastTrackParticles` | 双模态 14 粒子系统（Ultra 失重星尘 / Fast 满轨高速流光） |
| L7 | `.handle` + `.Burst` | 28↔32px 非对称弹簧物理旋钮 + 解锁 Ultra 瞬间 16 颗径向爆发粒子 |

**关键设计**：L3–L6 全部挂载在 `.fill` 内部而非 `.track` 内部，回拉滑块时能量场与粒子会被同步精准截断，绝不溢出到未激活灰轨。

---

## 二、五大核心数学与图形技巧

### 1. `--correction` 几何补偿与零重排裁剪
- 轨道高 `24px`，旋钮直径 `28px`，两端内缩 `13px`：
  $$x_{\text{center}}(p) = 13 + p \cdot (W - 26) = \underbrace{p \cdot W}_{\texttt{--p}} + \underbrace{(13 - 26p)}_{\texttt{--correction}}$$
- `.fill` 固定 `inset: 0`，仅改 `clip-path: inset(0 calc(100% - var(--p) - var(--correction)) 0 0)`：
  - 零 Layout 重排，不触发 `offsetWidth` 同步回流；
  - `<canvas>` 分辨率恒定，不反复重建帧缓冲；
  - 内部粒子坐标静止，滑动像「拉窗帘」而不被挤压。

### 2. WebGL 12 节点高斯径向基（RBF）+ `luminosity` 混合
- **窄带切片**：将 `rawUv.y` 映射到 `[0.40, 0.58]`，在 2D 能量场中裁出 18% 高度的细带并横向拉伸 `1.55×`。
- **加权平均**：12 个非谐波李萨如轨道色源用高斯核 $w_k = \exp(-12\|p - c_k(t)\|^2) \cdot (0.7 + 0.3\,\text{osc}(\omega_k t))$ 归一化加权，再混入 `0.012` 高频胶片颗粒（Dithering）消除 8-bit 紫黑渐变色带。
- **`mix-blend-mode: luminosity` + `isolation: isolate`**：上层 WebGL 只提供动态明度，下层 CSS 渐变锁定品牌色相与饱和度；换肤无需改 GLSL，WebGL 降级也不白屏。

### 3. Houdini `@property` 120px 羽化揭幕
注册 `<percentage>` 类型自定义属性 `--model-picker-power-slider-max-fill-mask-position`，通过 `@keyframes` 从 `100%` 插值到 `0%`，驱动 `linear-gradient(90deg, transparent calc(var(--pos) - 120px), #000 var(--pos), #000 100%)` 遮罩沿 `cubic-bezier(.2, 0, 0, 1)` 平推 2 秒。

### 4. 三套粒子系统各司其职
- **Ultra 环境星尘（14 颗）**：首帧同步写入确定性 `seed` 起点，`20ms` 后再触发首次 CSS `transition: translate` 随机漫步，避免首帧样式合并吃掉过渡。
- **Fast 高速流光（14 道）**：纯 CSS 无限关键帧 + 负延迟公式 `animationDelay = (i * 1.9 / 14 - duration) + "s"`，开启第一帧即满轨流动，零冷启动。
- **Ultra 径向爆发（16 颗）**：`changed && burst && level === 4 && !motion.matches` 四重门控防误炸，`700ms` 后自动 `remove()`。

### 5. 非对称阻尼弹簧 + 8× 子步进积分
- **放大（悬停/按下）**：$k = 420, d = 38 \implies \zeta \approx 0.927$（干脆起跳）
- **回弹（离开/松手）**：$k = 220, d = 26 \implies \zeta \approx 0.876$（柔和收尾）
- **稳定性**：单帧 $\Delta t$ 钳制在 `50ms`，拆成 `8×` 子步进（单子步 $\le 6.25\text{ms}$）半隐式欧拉积分；误差收敛后自动停掉 `rAF`，静止态 CPU 占用归零。

---

## 三、可直接复用的 8 条微交互工程检查清单

| # | 维度 | 推荐做法 | 避免的坑 |
| --- | --- | --- | --- |
| 1 | **布局与裁剪** | 填充层保持 100% 宽度，用 `clip-path: inset(...)` + CSS 变量控进度 | 改 `width` 触发每帧 Layout 重排、渐变压缩与 Canvas 重建 |
| 2 | **几何定位** | CSS 侧用 `var(--p) + (r - 2r·p)` 完成端帽补偿 | JS 每帧读 `offsetWidth` 引发强制同步回流 |
| 3 | **着色器与品牌色** | CSS 渐变锁色相 + `isolation: isolate` + `mix-blend-mode: luminosity` | 品牌色硬编码进 GLSL，换肤难且 WebGL 不可用时白屏 |
| 4 | **揭幕转场** | Houdini `@property` 注册 `<percentage>` 驱动羽化 `mask-image` | 只能做生硬的整体 `opacity` 淡入淡出 |
| 5 | **连续流粒子** | 纯 CSS 无限 `@keyframes` + 负 `animation-delay` 相位预热 | 特效开启后出现 1 秒空跑道冷启动，或 JS 定时器硬刷 |
| 6 | **物理手感** | 非对称刚度胡克定律弹簧 + `8×` 子步进 + 静止自动休眠 | CSS `transition` 中途打断生硬折角；单步欧拉掉帧发散 |
| 7 | **拖拽与无障碍** | `setPointerCapture` / `onlostpointercapture` 统一收口；隐形 `<input>` 承接键盘与 ARIA | 拖出窗口粘死；自定义控件无法键盘操作与读屏 |
| 8 | **功耗与降级** | `visibilitychange` 彻底释放 WebGL Buffer/Program；DPR 封顶 2×；全链路响应 `prefers-reduced-motion` | 切后台 GPU 偷跑风扇狂转；对动效敏感用户造成眩晕 |
