const { computed, inject } = Vue
const { Handle, Position } = VueFlowCore

const cards = {
  intake: { title: '文档接入', note: '资料目录', sides: ['out'] },
  parser: { title: '内容解析', note: '解析服务', sides: ['in', 'out'] },
  indexer: { title: '索引写入', note: '文档知识库', sides: ['in'] }
}

const modes = ['仅解析', '解析并写入', '暂缓解析']
const hourlyIntake = [3, 5, 9, 14, 20, 25, 29, 31, 27, 21, 14, 7]
const writeSamples = [7, 12, 13, 16, 19, 19, 20, 23, 24, 22, 24, 26, 23, 25, 27, 25, 25, 27, 27, 25, 27, 27, 25, 25]
const indexPhases = {
  idle: { caption: '等待接收解析结果', metric: '写入速率', label: '待写入' },
  writing: { caption: '正在为本批文档建立索引', metric: '实时写入速率', label: '写入中' },
  complete: { caption: '12 份文档已可检索', metric: '本批平均写入速率', label: '已完成' }
}

const clamp = value => Math.max(0, Math.min(1, value))

function smoothstep(start, end, value) {
  const t = clamp((value - start) / (end - start))
  return t * t * (3 - 2 * t)
}

export const WorkflowNode = {
  name: 'WorkflowNode',
  components: { Handle },
  props: {
    id: { type: String, required: true },
    data: { type: Object, default: () => ({}) }
  },
  setup(props) {
    const workflow = inject('workflow')
    const card = computed(() => cards[props.id])
    const progress = computed(() => clamp(workflow.routing))
    const percent = computed(() => Math.round(progress.value * 100))
    const filledSegments = computed(() => Math.floor(progress.value * 14))
    const indexPhase = computed(() => indexPhases[workflow.indexStatus])
    const visualStyle = computed(() => {
      if (props.id === 'indexer') {
        return { '--chart-light': smoothstep(0, .54, workflow.chart) * workflow.chartFade }
      }
      if (props.id === 'parser' && workflow.status === '解析中') {
        const t = progress.value
        const arrival = Math.exp(-(((t - .19) / .135) ** 2))
        const glint = smoothstep(0, .17, t) * (.31 + .28 * arrival)
          + .64 * smoothstep(.47, .86, t) - .07 * smoothstep(.89, 1, t)
        return { '--cell-light': Math.max(.36, glint) }
      }
      return {}
    })
    const chartBars = computed(() => {
      if (props.id !== 'indexer') return []
      return writeSamples.map((height, i) => {
        const delay = .48 * i / (writeSamples.length - 1)
        const rise = clamp((workflow.chart - delay) / .52)
        const brightness = (1 - (1 - rise) ** 2.35) * workflow.chartFade
        const scale = .11 + .89 * (1 - (1 - rise) ** 3.4) * (.42 + .58 * workflow.chartFade)
        return { height: height + 'px', opacity: brightness, transform: 'scaleY(' + scale + ')' }
      })
    })
    function portName(side) {
      return card.value.title + (side === 'in' ? '输入端口' : '输出端口')
    }
    function portHint(side) {
      return workflow.handleOn(props.id, side) ? '拖开以断开连接' : '拖到对应端口以连接'
    }
    return { workflow, card, progress, percent, filledSegments, indexPhase, visualStyle, chartBars,
      modes, hourlyIntake, writeSamples, Position, portName, portHint }
  },
  template: `
    <article class="workflow-card" :class="'workflow-card--' + id" :data-workflow-node="id" :style="visualStyle" :aria-label="card.title">
      <div class="workflow-surface">
        <header class="workflow-header">
          <span class="workflow-lamp" :class="{
            'is-parsing': id === 'parser' && workflow.status === '解析中',
            'is-ready': id === 'parser' && workflow.status === '已解析',
            'is-paused': id === 'parser' && workflow.status === '已暂缓',
            'is-writing': id === 'indexer' && workflow.indexStatus !== 'idle'
          }" aria-hidden="true"></span>
          <strong>{{ card.title }}</strong>
          <span class="workflow-header-note">{{ card.note }}</span>
        </header>

        <div v-if="id === 'intake'" class="workflow-body">
          <div class="workflow-label">本批资料</div>
          <div class="intake-values">
            <div class="intake-value"><span>文档数量</span><strong>12 份文档</strong></div>
            <div class="intake-value"><span>文件大小</span><strong>4.2 MB</strong></div>
          </div>
          <div class="intake-history">
            <div class="workflow-label-row"><span class="workflow-label">今日接入</span><span>186 份</span></div>
            <div class="intake-bars" aria-hidden="true">
              <i v-for="(height, i) in hourlyIntake" :key="i" :class="{ current: i === 7, future: i > 7 }" :style="{ height: height + 'px' }"></i>
            </div>
          </div>
        </div>

        <div v-else-if="id === 'parser'" class="workflow-body">
          <div class="workflow-label">处理方式</div>
          <div class="parser-modes nodrag nopan" role="group" aria-label="内容解析处理方式">
            <button v-for="mode in modes" :key="mode" type="button" :aria-pressed="workflow.mode === mode"
              @click.stop="workflow.setMode(mode)">{{ mode }}</button>
          </div>
          <div class="parser-progress" role="progressbar" aria-label="解析进度"
            aria-valuemin="0" aria-valuemax="100" :aria-valuenow="percent">
            <div class="workflow-label-row"><span class="workflow-label">解析进度</span><span>{{ percent }}%</span></div>
            <div class="parser-segments" aria-hidden="true">
              <i v-for="n in 14" :key="n" :class="{
                full: n <= filledSegments,
                filling: workflow.status === '解析中' && n === filledSegments + 1
              }"></i>
            </div>
          </div>
          <div class="parser-status">
            <span>{{ workflow.status }}</span>
            <span class="parser-track" aria-hidden="true"><i :style="{transform: 'scaleX(' + progress + ')'}"></i></span>
          </div>
        </div>

        <template v-else>
          <div class="indexer-main" :class="{ 'is-writing': workflow.indexStatus !== 'idle' }">
            <div class="indexer-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
                <ellipse cx="8" cy="4" rx="5" ry="2"/>
                <path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8"/>
              </svg>
            </div>
            <div class="indexer-reading"><strong>{{ workflow.rate.toFixed(1) }}</strong><span>千字/秒</span></div>
            <div class="indexer-caption">{{ indexPhase.caption }}</div>
            <div class="indexer-chart" aria-hidden="true">
              <div class="indexer-bars indexer-baseline"><i v-for="(height, i) in writeSamples" :key="i" :style="{height: Math.max(1, height * .11) + 'px'}"></i></div>
              <div class="indexer-bars indexer-wave"><i v-for="(bar, i) in chartBars" :key="i" :style="bar"></i></div>
            </div>
          </div>
          <footer class="indexer-footer"><span>{{ indexPhase.metric }}</span><span :class="'phase-' + workflow.indexStatus">{{ indexPhase.label }}</span></footer>
        </template>
      </div>
      <Handle v-for="side in card.sides" :key="side" :id="side" :data-workflow-port="side"
        :type="side === 'in' ? 'target' : 'source'"
        :position="side === 'in' ? Position.Left : Position.Right"
        class="workflow-port" :class="{ 'is-attached': workflow.handleOn(id, side) }"
        :title="portName(side) + ' · ' + portHint(side)" :aria-label="portName(side)" tabindex="0" role="button"
        @keydown.enter.stop.prevent="workflow.activatePort(id, side)"
        @keydown.space.stop.prevent="workflow.activatePort(id, side)" />
    </article>`
}
