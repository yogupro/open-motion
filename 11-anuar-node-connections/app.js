import { WorkflowNode } from './cards.js'
import { createWireRenderer } from './wires.js'
import { createWorkflow } from './workflow.js'
import { chooseLayout, fitLayout } from './layout.js'

const { createApp, ref, reactive, shallowRef, provide, onMounted, onBeforeUnmount, watch } = Vue
const { VueFlow, useVueFlow } = VueFlowCore
const links = [
  { id: 'intake-parser', source: 'intake', target: 'parser', sourceHandle: 'out', targetHandle: 'in' },
  { id: 'parser-indexer', source: 'parser', target: 'indexer', sourceHandle: 'out', targetHandle: 'in' }
]
const initialNodes = (layout) => layout.map(({ id, x, y, width, height }) => ({
  id, type: 'workflow', position: { x, y }, data: {}, style: { width: width + 'px', height: height + 'px' }
}))
const portLink = (id, side) => links.findIndex(l => side === 'out' ? l.source === id : l.target === id)

createApp({
  components: { VueFlow, WorkflowNode },
  setup() {
    const host = ref(null), canvas = ref(null)
    let layout = chooseLayout(innerWidth, innerHeight)
    const nodes = shallowRef(initialNodes(layout.nodes)), edges = shallowRef([...links])
    const initialView = fitLayout(innerWidth, innerHeight, layout)
    const graph = useVueFlow('document-workflow')
    const model = createWorkflow()
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const workflow = reactive({
      mode: '解析并写入', status: '待接收', routing: 0, rate: 0, chart: 0, chartFade: 1,
      indexStatus: 'idle', running: false, portrait: Boolean(layout.portrait), attached: [true, true],
      handleOn: (id, side) => workflow.attached[portLink(id, side)],
      setMode(value) { feedback.value = ''; model.setMode(value, now()); wake() },
      activatePort
    })
    provide('workflow', workflow)

    let origin = performance.now(), hiddenSince = null
    let frame = 0, renderer, observer, draft = null
    let keyboardPort = null, focusedPointer = null
    let width = 0, height = 0, lastPaint = 0, wasRunning = false, filamentTime = 0
    const retreats = [null, null]
    const latches = [null, null]
    const announcement = ref(''), feedback = ref('')
    const now = () => ((hiddenSince ?? performance.now()) - origin) / 1000

    function wake() {
      if (!frame && renderer && !document.hidden) frame = requestAnimationFrame(paint)
    }
    function stopFrame() {
      cancelAnimationFrame(frame)
      frame = 0
    }
    function synchroniseGraph() {
      edges.value = links.filter((_, i) => model.connected[i])
      workflow.attached = [...model.connected]
    }
    function setLink(index, attached, t, latchStart = false) {
      model.sample(t)
      model.attach(index, attached, t)
      latches[index] = attached && !media.matches ? { start: t, latchStart } : null
      feedback.value = ''
      retreats[index] = null
      synchroniseGraph()
      wake()
    }
    function retract(gesture, t) {
      if (gesture && !media.matches) retreats[gesture.link] = { ...gesture, start: t }
      wake()
    }
    function run() {
      feedback.value = ''
      const t = now()
      if (model.run(t)) {
        announcement.value = '工作流已启动。'
      } else if (!model.connected[0]) {
        feedback.value = '请连接「文档接入」与「内容解析」'
      } else if (workflow.mode === '解析并写入' && !model.connected[1]) {
        feedback.value = '请连接「内容解析」与「索引写入」'
      }
      wake()
    }

    function centerOfPort(index, side) {
      const id = side === 'out' ? links[index].source : links[index].target
      const blueprint = layout.nodes.find(item => item.id === id)
      const position = graph.findNode(id)?.position ?? blueprint
      return {
        x: position.x + (side === 'out' ? blueprint.width : 0),
        y: position.y + blueprint.height / 2
      }
    }
    function clientPoint(event) {
      const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event
      return graph.screenToFlowCoordinate({ x: point.clientX, y: point.clientY })
    }
    function getLinks(sample, t) {
      return links.map(({ source, target }, i) => {
        const wire = { from: centerOfPort(i, 'out'), to: centerOfPort(i, 'in'),
          progress: model.connected[i] ? 1 : 0, pulse: sample.pulses[i] }
        const latch = latches[i]
        if (latch) {
          if (t - latch.start < 0.65) {
            wire.latchAge = t - latch.start
            wire.latchStart = latch.latchStart
          } else latches[i] = null
        }
        const live = draft?.link === i ? draft : null
        const loose = live || retreats[i]
        if (loose) {
          wire[loose.anchorEnd ? 'from' : 'to'] = loose.tip
          wire.anchorEnd = wire.freeStart = loose.anchorEnd
          wire.freeEnd = !loose.anchorEnd
          wire.progress = live ? 1 : Math.max(0, 1 - (t - loose.start) / 0.32) ** 2.15
          wire.pulse = null
          if (!live && wire.progress === 0) retreats[i] = null
        }
        // When stacked cards overlap horizontally, use the open space between their faces.
        const sourceHeight = layout.nodes.find(node => node.id === source).height
        const targetHeight = layout.nodes.find(node => node.id === target).height
        const dy = wire.to.y - wire.from.y
        const gapHeight = Math.abs(dy) - (sourceHeight + targetHeight) / 2
        const overlap = wire.from.x - wire.to.x
        if (gapHeight > 0 && overlap > 0) {
          const direction = Math.sign(dy)
          const mix = Math.min(1, gapHeight / 36, overlap / 32)
          wire.sideRoute = { direction, gapHeight, gapY: wire.from.y + direction * (sourceHeight + gapHeight) / 2,
            blend: mix * mix * (3 - 2 * mix) }
        }
        return wire
      })
    }
    function paint() {
      frame = 0
      if (!width || !height) return
      const t = now()
      const sample = model.sample(t)
      const view = graph.viewport.value
      for (const key of ['mode', 'status', 'routing', 'rate', 'chart', 'chartFade', 'indexStatus', 'running']) {
        workflow[key] = sample[key]
      }
      if (!media.matches && wasRunning && sample.running) filamentTime += t - lastPaint
      wasRunning = sample.running
      lastPaint = t
      const boxes = layout.nodes.map((box, i) => ({
        ...box, ...(graph.findNode(box.id)?.position ?? {}),
        flashAge: sample.ages[i], flashSide: i === 0 ? 'right' : 'left'
      }))
      renderer.draw({ width, height, scale: view.zoom, offsetX: view.x, offsetY: view.y, time: filamentTime,
        nodes: boxes, links: getLinks(sample, t) })

      if (sample.animating || retreats.some(Boolean) || latches.some(Boolean)) wake()
    }

    function resize() {
      if (!host.value) return
      width = host.value.clientWidth
      height = host.value.clientHeight
      if (width && height) {
        const next = chooseLayout(width, height)
        if (next !== layout) {
          // Keep manual offsets relative to each card's place in the new composition.
          const offsets = new Map(layout.nodes.map(node => {
            const position = graph.findNode(node.id)?.position ?? node
            return [node.id, { x: position.x - node.x, y: position.y - node.y }]
          }))
          layout = next
          workflow.portrait = Boolean(layout.portrait)
          nodes.value = initialNodes(layout.nodes).map(node => {
            const offset = offsets.get(node.id)
            node.position.x += offset.x
            node.position.y += offset.y
            return node
          })
          retreats.fill(null)
          draft = keyboardPort = null
          Vue.nextTick(() => {
            graph.updateNodeInternals(layout.nodes.map(n => n.id))
            wake()
          })
        }
        const view = fitLayout(width, height, layout)
        const buttonScale = Math.max(1, Math.min(1.45, view.zoom))
        host.value.style.setProperty('--button-scale', buttonScale)
        host.value.style.setProperty('--button-bottom', 12 * buttonScale + 'px')
        graph.setViewport(view)
        wake()
      }
    }
    watch(graph.viewport, v => {
      host.value?.style.setProperty('--grid', 16 * v.zoom + 'px')
      host.value?.style.setProperty('--grid-x', (v.x + 7.5 * v.zoom) + 'px')
      host.value?.style.setProperty('--grid-y', (v.y + 7.5 * v.zoom) + 'px')
      wake()
    }, { deep: true })

    // Vue Flow handles new connections. For unplugging an existing end, hold its
    // opposite socket fixed while the loose end follows the captured pointer.
    function pointerDown(event) {
      if (event.button !== 0 || !event.isPrimary) return
      keyboardPort = null
      const port = event.target.closest('.vue-flow__handle')
      if (!port) return
      const { nodeid, handleid } = port.dataset
      const link = portLink(nodeid, handleid)
      if (link < 0 || !model.connected[link]) return
      event.preventDefault()
      focusedPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
      draft = { link, anchorEnd: handleid === 'out', tip: centerOfPort(link, handleid) }
      host.value.setPointerCapture(event.pointerId)
      setLink(link, false, now())
    }
    function blockNativeDrag(event) {
      if (focusedPointer) { event.preventDefault(); event.stopPropagation() }
    }
    function pointerMove(event) {
      if (!draft || !event.isPrimary) return
      const tip = clientPoint(event)
      const socket = centerOfPort(draft.link, draft.anchorEnd ? 'out' : 'in')
      const gap = Math.hypot(tip.x - socket.x, tip.y - socket.y) * graph.viewport.value.zoom
      draft.tip = gap < 14 ? socket : tip
      wake()
    }
    function releasePointer(event) {
      if (focusedPointer?.id !== event.pointerId) return
      const { x, y } = focusedPointer
      const loose = draft
      draft = focusedPointer = null
      if (host.value.hasPointerCapture(event.pointerId)) host.value.releasePointerCapture(event.pointerId)
      if (!loose) return
      const socket = centerOfPort(loose.link, loose.anchorEnd ? 'out' : 'in')
      const tip = clientPoint(event)
      const moved = Math.hypot(event.clientX - x, event.clientY - y) > 4
      const close = Math.hypot(tip.x - socket.x, tip.y - socket.y) * graph.viewport.value.zoom <= 24
      if (event.type === 'pointerup' && moved && close) setLink(loose.link, true, now(), loose.anchorEnd)
      else retract(loose, now())
      wake()
    }
    function validConnection(c) {
      return links.some(l => l.source === c.source && l.target === c.target &&
        c.sourceHandle === 'out' && c.targetHandle === 'in')
    }
    function connectStart({ nodeId, handleId }) {
      const link = portLink(nodeId, handleId)
      if (link < 0 || focusedPointer) return
      retreats[link] = null
      draft = { link, anchorEnd: handleId === 'in', tip: centerOfPort(link, handleId) }
      wake()
    }
    function connect(c) {
      if (!validConnection(c)) return
      setLink(portLink(c.source, 'out'), true, now(), draft?.anchorEnd ?? false)
      draft = null
    }
    function connectEnd() {
      if (draft && !focusedPointer) {
        retract(draft, now())
        draft = null
      }
      wake()
    }
    function activatePort(id, side) {
      const link = portLink(id, side)
      if (link < 0) return
      if (model.connected[link]) {
        setLink(link, false, now())
        retract({ link, anchorEnd: false, tip: centerOfPort(link, 'in') }, now())
        keyboardPort = null
        announcement.value = '已断开连接。'
      } else if (keyboardPort?.link === link && keyboardPort.side !== side) {
        setLink(link, true, now(), side === 'out')
        keyboardPort = null
        announcement.value = '接线成功。'
      } else {
        keyboardPort = { link, side }
        announcement.value = '请选择另一端的插口，按回车连接。'
      }
    }
    function keyDown(event) {
      if (event.key === 'Escape') {
        keyboardPort = null
        feedback.value = ''
      }
    }
    function visibility() {
      if (document.hidden) {
        hiddenSince = performance.now()
        stopFrame()
      } else {
        if (hiddenSince !== null) origin += performance.now() - hiddenSince
        hiddenSince = null
        wake()
      }
    }
    function motionPreference() {
      if (media.matches) { latches.fill(null); retreats.fill(null) }
      model.setReduced(media.matches, now())
      wake()
    }
    onMounted(() => {
      renderer = createWireRenderer(canvas.value)
      observer = new ResizeObserver(resize)
      observer.observe(host.value)
      window.addEventListener('resize', resize)
      resize()
      model.setReduced(media.matches, now())
      document.addEventListener('visibilitychange', visibility)
      media.addEventListener('change', motionPreference)
      window.addEventListener('keydown', keyDown)
      window.addEventListener('pointermove', pointerMove)
      wake()
    })
    onBeforeUnmount(() => {
      stopFrame()
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      renderer?.destroy()
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', motionPreference)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('pointermove', pointerMove)
    })
    return { host, canvas, nodes, edges, workflow, initialView, announcement, feedback, run, wake, resize,
      pointerDown, blockNativeDrag, releasePointer, validConnection, connect, connectStart, connectEnd }
  },
  template: `
    <section ref="host" class="stage" :class="{portrait: workflow.portrait}" aria-label="文档索引工作流" aria-describedby="guide"
      @pointerdown.capture="pointerDown" @pointerup="releasePointer" @pointercancel="releasePointer"
      @lostpointercapture="releasePointer" @mousedown.capture="blockNativeDrag" @touchstart.capture="blockNativeDrag">
      <p id="guide" class="sr-only">点击「运行工作流」开始处理文档。拖动已连接的插口可以拔线。
        拖动到对应插口即可重新接线。使用键盘时，聚焦插口后按回车选择两端。</p>
      <VueFlow id="document-workflow" :nodes="nodes" :edges="edges" :default-viewport="initialView"
        :min-zoom="0.16" :max-zoom="3" :connect-on-click="false" :connection-radius="24"
        :auto-pan-on-connect="false" :auto-pan-on-node-drag="false" :is-valid-connection="validConnection"
        :delete-key-code="null" :edges-focusable="false" :elements-selectable="false" :zoom-on-double-click="false"
        @init="resize" @node-drag="wake" @nodes-change="wake" @viewport-change="wake"
        @connect="connect" @connect-start="connectStart" @connect-end="connectEnd">
        <template #node-workflow="props"><WorkflowNode :id="props.id" :data="props.data" /></template>
      </VueFlow>
      <canvas class="wires" ref="canvas" aria-hidden="true"></canvas>
      <div class="workflow-actions">
        <p v-if="feedback" class="run-feedback" role="status">{{feedback}}</p>
        <button type="button" class="run-workflow" @click="run" :disabled="workflow.running">
          <svg viewBox="0 0 6 8" aria-hidden="true"><path d="M0 .5 5.6 4 0 7.5Z"/></svg>
          {{workflow.running ? '运行中' : '运行工作流'}}
        </button>
      </div>
      <span role="status" class="sr-only">{{announcement}}</span>
    </section>`
}).mount('#app')
