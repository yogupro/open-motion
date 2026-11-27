// Durations in seconds, measured from the reference's pulse, node dwell and meter.
const FLIGHT = 0.936
const PARSE = 1.166
const WRITE = 1.02
const CHART_RELEASE = 0.68
const PARSED_AT = FLIGHT + PARSE
const WRITING_AT = PARSED_AT + FLIGHT
const COMPLETE_AT = WRITING_AT + WRITE
const modes = ['仅解析', '解析并写入', '暂缓解析']
const clamp = value => Math.max(0, Math.min(1, value))
const idle = () => ({ status: '待接收', routing: 0, indexStatus: 'idle', rate: 0, chart: 0 })

function finalResult(mode) {
  if (mode === '暂缓解析') return { ...idle(), status: '已暂缓' }
  const result = { ...idle(), status: '已解析', routing: 1 }
  return mode === '解析并写入' ? { ...result, indexStatus: 'complete', rate: 7.4, chart: 1 } : result
}

export function createWorkflow() {
  const connected = [true, true]
  let mode, batch, result, decay, reduced = false

  function reset() {
    connected.fill(true)
    mode = '解析并写入'
    batch = decay = null
    result = idle()
  }

  function sample(t) {
    let state = result
    let ages = [-1, -1, -1], pulses = [null, null], running = false
    let chartFade = 1

    if (batch) {
      const elapsed = t - batch.start
      const parse = batch.mode !== '暂缓解析'
      const write = batch.mode === '解析并写入'
      const end = write ? COMPLETE_AT : parse ? PARSED_AT : FLIGHT
      running = elapsed < end
      if (!running) state = finalResult(batch.mode)
      else if (elapsed >= FLIGHT) {
        const routing = clamp((elapsed - FLIGHT) / PARSE)
        state = { ...result, status: elapsed < PARSED_AT ? '解析中' : '已解析', routing }
        if (write && elapsed >= WRITING_AT) {
          const chart = clamp((elapsed - WRITING_AT) / WRITE)
          const speed = clamp((elapsed - WRITING_AT + 1 / 60) / WRITE)
          state = { ...state, indexStatus: 'writing', chart, rate: Math.round(74 * (1 - (1 - speed) ** 3)) / 10 }
        }
      }
      ages = [elapsed, elapsed - FLIGHT, write ? elapsed - WRITING_AT : -1]
        .map(age => age >= 0 && age < 2 ? age : -1)
      pulses = [elapsed, write ? elapsed - PARSED_AT : -1]
        .map(age => age >= 0 && age < FLIGHT * 1.45 ? age / FLIGHT : null)
    } else if (decay) {
      const elapsed = Math.max(0, t - decay.start)
      if (elapsed < CHART_RELEASE) {
        state = { ...state, chart: decay.chart }
        chartFade = Math.exp(-9.2 * elapsed)
      } else decay = null
    }

    return { ...state, mode, chartFade, ages, pulses, running,
      animating: running || ages.some(age => age >= 0) || Boolean(decay) }
  }

  function run(t) {
    if (sample(t).running || !connected[0] || (mode === '解析并写入' && !connected[1])) return false
    result = reduced ? finalResult(mode) : idle()
    batch = reduced ? null : { mode, start: t }
    decay = null
    return true
  }

  function cancel(t, current, keepParsed) {
    batch = null
    result = keepParsed && current.status === '已解析' ? finalResult('仅解析') : idle()
    decay = !reduced && current.chart > 0 ? { start: t, chart: current.chart } : null
  }

  function attach(index, attached, t) {
    if (index !== 0 && index !== 1 || connected[index] === attached) return
    connected[index] = attached
    if (attached || !batch || index === 1 && batch.mode !== '解析并写入') return
    const current = sample(t)
    if (current.running) cancel(t, current, index === 1)
  }

  function setMode(value, t) {
    if (!modes.includes(value) || mode === value) return
    const current = sample(t)
    if (current.running) cancel(t, current, true)
    mode = value
  }

  function setReduced(value) {
    reduced = value
    if (!reduced) return
    if (batch) result = finalResult(batch.mode)
    batch = decay = null
  }

  reset()
  return { connected, reset, run, attach, setMode, sample, setReduced }
}
