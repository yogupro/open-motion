(() => {
  "use strict";

  const LOOP = 16.6;
  const phrase = ["帮", "我", "设个", "十分钟", "的", "计时器，", "时间到了", "提醒", "我", "浇花。"];
  const prompt = ["需要", "我", "帮", "什么", "忙？"];
  const timerRequest = ["设", "个", "计时器"];
  const clamp = x => Math.min(1, Math.max(0, x));
  const mix = (a, b, x) => a + (b - a) * x;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const flight = (age, duration) => age >= 0 && age < duration ? age / duration : -1;

  function sweepAt(age, kind) {
    // The first trip builds from the listening mound. Subsequent trips linger at
    // the ends and pass much faster through the middle of the panel.
    const agent = kind === "agent";
    const period = agent ? 2.25 : 1.95;
    const firstCross = agent ? 1.06 : 1.02;
    const sharpness = agent ? 1.81 : 1.60;
    const swing = -Math.sin(2 * Math.PI * (age - firstCross) / period);
    const entry = 1 - Math.exp(-Math.pow(age / (agent ? .40 : .54), 1.5));
    return (agent ? .511 : .518) + (agent ? .376 : .469) * entry * Math.tanh(sharpness * swing) / Math.tanh(sharpness);
  }

  function demoSweep(t, kind, thinkAt, resumeAt) {
    if (t < thinkAt) return .5;
    const crest = sweepAt(Math.min(t, resumeAt) - thinkAt, kind);
    return mix(.5, crest, Math.exp(-3 * Math.max(0, t - resumeAt)));
  }

  // Damped travel fitted to the two disc silhouettes in the 60 fps reference.
  // Both overshoots matter: the mic pushes past its seat on the way out, and
  // the reunited drop recoils to the right on the way back.
  function gateFrame(gate, now, reduced, kind) {
    const {active, at, fromSplit, fromVelocity, fromLevel} = gate;
    const controlAge = reduced ? Infinity : now - at;
    const target = Number(active);
    let split = target, splitVelocity = 0;
    if (controlAge < 1.1) {
      const fromRest = Math.abs(fromVelocity) < .035;
      const lead = fromRest ? (active ? .055 : .040) : 0;
      if (controlAge <= lead) {
        split = fromSplit;
        splitVelocity = fromVelocity;
      } else {
        const t = controlAge - lead;
        const damping = active ? 6.86 : 12.79, frequency = active ? 8.06 : 4.73;
        const a = fromSplit - target;
        const velocity = fromRest ? -a * (active ? 6.25 : 22.98) : fromVelocity;
        const b = (velocity + damping * a) / frequency;
        const cos = Math.cos(frequency * t), sin = Math.sin(frequency * t);
        const decay = Math.exp(-damping * t);
        const displacement = a * cos + b * sin;
        split += decay * displacement;
        splitVelocity = decay * (frequency * (b * cos - a * sin) - damping * displacement);
      }
    }
    // Light departs the waveform lobe just after the liquid neck releases.
    const launchDelay = kind === "agent" ? .09 : .18;
    const release = controlAge > .60 ? 0 : Math.exp(-.5 * (controlAge / .16) ** 2);
    return {
      gate, controlAge, split, splitVelocity,
      opening: active ? flight(controlAge - launchDelay, 1.05 - launchDelay) : -1,
      closing: active ? -1 : flight(controlAge, .85),
      level: active ? mix(fromLevel, 1, smooth(.45, 1.42, controlAge)) : fromLevel * release
    };
  }

  function sentence(age) {
    if (age < .9) return { words: prompt.slice(0, Math.max(1, Math.floor(age / .097) + 1)), prompt: true };
    const count = Math.max(1, Math.floor((age - .9) / .33) + 1);
    return { words: phrase.slice(0, count), prompt: false };
  }

  function listeningRecovery(age) {
    // The travelling peak drains, holds at a faint floor, then the next
    // syllables arrive before the broader listening mound has fully rebuilt.
    return 1 - .69 * smooth(0, .18, age)
      + .245 * smooth(.52, .86, age)
      + .445 * smooth(.88, 2.25, age);
  }

  function demoFrame(clock, kind, reduced) {
    const t = clock % LOOP;
    const agent = kind === "agent";
    const lastStart = agent ? 14.05 : 14.13;
    const middleSession = !agent && t >= 6.59 && t < lastStart;
    const start = t >= lastStart ? lastStart : middleSession ? 6.59 : lastStart - LOOP;
    const firstEnd = agent ? 4.62 : 4.10;
    const end = start < 0 ? firstEnd : start < 14 ? 12.46 : Infinity;
    const phase = Math.min(t, end) - start;
    const active = t < end;
    const gate = {
      active, at: clock - t + (active ? start : end),
      fromSplit: Number(!active), fromVelocity: 0, fromLevel: Number(!active)
    };
    const upperSolo = start < 0 && agent;
    const thinkAt = upperSolo ? 2.02 : middleSession ? 8.48 : Infinity;
    const resumeAt = upperSolo ? end : 11.25;
    if (middleSession && !active) gate.fromLevel = listeningRecovery(end - resumeAt);
    const thinking = thinkAt < Infinity
      ? smooth(thinkAt, thinkAt + .28, t) * (1 - smooth(resumeAt, resumeAt + .75, t)) : 0;
    const mode = !active ? "idle" : t >= thinkAt && t < resumeAt ? "thinking" : "listening";
    const sweep = demoSweep(t, kind, thinkAt, resumeAt);
    const sweepTail = demoSweep(t - .18, kind, thinkAt, resumeAt);
    let text;
    if (!active) {
      text = { words: timerRequest };
    } else if (upperSolo && t >= thinkAt) {
      text = { words: timerRequest.slice(0, 1 + Math.floor((t - thinkAt) / .34)) };
    } else {
      const thinkingTime = Math.max(0, Math.min(t, resumeAt) - thinkAt);
      text = sentence(phase - thinkingTime);
    }
    const frame = gateFrame(gate, clock, reduced, kind);
    if (middleSession && active && t >= resumeAt) frame.level *= listeningRecovery(t - resumeAt);
    return { ...frame, mode, phase, thinking, thinkingAge: Math.max(0, t - thinkAt), text, sweep, sweepTail };
  }

  // A smooth union of squared circle distances. Along any vertical slice the
  // common y² term cancels, so the bridge and its two retracting tips have
  // the same contour on either side of the instant of separation.
  function controlOutline(width, split) {
    const radius = 56, cy = 58, right = width - 58;
    const distance = (width - 116) * Math.max(0, split);
    const left = right - distance, mid = (left + right) / 2;
    const circle = x => `M${x},2a56,56 0 1 1 0,112a56,56 0 1 1 0,-112Z`;
    if (distance < .05) return circle(right);

    const blend = 1.79 * radius ** 2 * Math.sin(Math.PI / 2 * Math.min(1, distance / (2.4 * radius)));
    const join = blend / (2 * distance);
    if (distance / 2 - radius >= join) return circle(left) + circle(right);

    // Inside the blend, half-height² = waist² + curvature × offset².
    const waistSquared = radius ** 2 - distance ** 2 / 4 + blend / 4;
    const curvature = distance ** 2 / blend - 1;
    const separate = waistSquared < 0;
    const tip = separate ? Math.sqrt(-waistSquared / curvature) : 0;
    const shoulders = [];
    for (let i = 0; i <= 16; i++) {
      const fraction = i / 16;
      const x = mix(tip, join, separate ? fraction * fraction : fraction);
      shoulders.push([x, Math.sqrt(Math.max(0, waistSquared + curvature * x * x))]);
    }
    const point = (side, vertical, i) => {
      const [x, y] = shoulders[i];
      return `${(mid + side * x).toFixed(2)},${(cy + vertical * y).toFixed(2)}`;
    };
    const end = shoulders.length - 1;
    const largeArc = Number(join < distance / 2);
    function lobe(side) {
      let path = point(side, -side, 0);
      for (let i = 1; i <= end; i++) path += 'L' + point(side, -side, i);
      path += `A${radius},${radius} 0 ${largeArc} 1 ${point(side, side, end)}`;
      for (let i = end - 1; i >= 0; i--) path += 'L' + point(side, side, i);
      return path;
    }
    return 'M' + lobe(1) + (separate ? 'ZM' : 'L') + lobe(-1) + 'Z';
  }

  function makeControls(card, kind, onCommand) {
    const el = card.querySelector(".voice-controls");
    el.append(document.querySelector("#controls").content.cloneNode(true));
    const skin = el.querySelector(".skin"), gradient = skin.querySelector("linearGradient");
    const path = skin.querySelector("path"), mic = el.querySelector(".mic");
    const toggle = el.querySelector(".voice-toggle");
    const cross = el.querySelector(".cross"), wave = el.querySelector(".wave");
    const width = kind === "agent" ? 272.5 : 264;
    const diameter = kind === "agent" ? 82 : 114;
    const travel = (width - 116) * diameter / 114;
    skin.setAttribute("viewBox", `0 0 ${width} 116`);
    el.style.transformOrigin = `calc(100% - ${diameter / 2 + 1}px) 50%`;
    gradient.id = `edge-${kind}`;
    path.setAttribute("stroke", `url(#${gradient.id})`);
    let mode, lastSplit = -1;
    let micAlpha, swap, micFrom, swapFrom, lastScale, lastRecoil;
    toggle.addEventListener("click", () => onCommand(mode === "idle" ? "listening" : "idle"));
    mic.addEventListener("click", () => onCommand(mode === "thinking" ? "listening" : "thinking"));
    return frame => {
      if (mode !== frame.mode) {
        const active = frame.mode !== "idle";
        if (mode === undefined || (mode !== "idle") !== active) {
          micFrom = micAlpha ?? Number(active);
          swapFrom = swap ?? Number(active);
        }
        mode = frame.mode;
        mic.disabled = mode === "idle";
        mic.setAttribute("aria-label", mode === "thinking" ? "继续聆听" : "切换到思考");
        toggle.setAttribute("aria-label", mode === "idle" ? "开始语音对话" : "结束语音对话");
      }
      const s = frame.split, age = frame.controlAge ?? Infinity, active = mode !== "idle";
      const press = active ? .047 * smooth(0, .045, age) * (1 - smooth(.055, .095, age)) : 0;
      const scale = 1 - press;
      // The incoming lobe pushes the anchor before they finish merging. Both
      // then travel together until their shared momentum has dissipated.
      const impact = .10 * (1 - clamp(s)) * smooth(0, 1.1, -frame.splitVelocity);
      const recoil = Math.max(0, -s, impact);
      if (lastSplit !== s || lastScale !== scale || lastRecoil !== recoil) {
        lastSplit = s; lastScale = scale; lastRecoil = recoil;
        path.setAttribute("d", controlOutline(width, s + recoil));
        el.style.transform = `translateX(${recoil * travel}px) scale(${scale})`;
        mic.style.transform = `translate(${-(s + recoil) * travel}px, -50%)`;
      }
      // The waveform stays in the original lobe while the mic emerges from the neck.
      const micReveal = active ? smooth(.182, .306, age) : smooth(.018, .145, age);
      const swapReveal = active ? smooth(.115, .303, age) : smooth(.072, .217, age);
      const nextMic = mix(micFrom, Number(active), micReveal);
      const nextSwap = mix(swapFrom, Number(active), swapReveal);
      if (nextMic !== micAlpha) {
        micAlpha = nextMic;
        mic.style.opacity = micAlpha;
        mic.style.filter = micAlpha > 0 && micAlpha < 1 ? `blur(${(1 - micAlpha) * 1.2}px)` : "";
      }
      if (nextSwap !== swap) {
        swap = nextSwap;
        cross.style.opacity = smooth(.24, 1, swap);
        wave.style.opacity = 1 - smooth(0, .73, swap);
        cross.style.filter = swap > 0 && swap < 1 ? `blur(${(1 - swap) * 4}px)` : "";
        wave.style.filter = swap > 0 && swap < 1 ? `blur(${Math.sqrt(swap) * 4}px)` : "";
        wave.style.transform = `scale(${1 - .16 * swap})`;
      }
    };
  }

  function makeTranscript(container) {
    const sample = document.createElement("span");
    sample.style.visibility = "hidden";
    container.append(sample);
    const widths = new Map();
    for (const word of new Set([...phrase, ...prompt, ...timerRequest])) {
      sample.textContent = word;
      widths.set(word, parseFloat(getComputedStyle(sample).width));
    }
    sample.remove();
    const letters = [];
    let key = "", changed = 0, settled = false;

    function layOut(words) {
      const lines = [[]];
      let lineWidth = 0;
      for (const word of words) {
        const width = widths.get(word);
        if (lineWidth + width > 608) { lines.push([]); lineWidth = 0; }
        lines.at(-1).push({word, width});
        lineWidth += width;
      }
      return lines.flatMap((line, row) => {
        const total = line.reduce((sum, w) => sum + w.width, 0);
        let x = -total / 2;
        return line.map(item => {
          const at = {word: item.word, x, y: (row - (lines.length - 1) / 2) * 50};
          x += item.width;
          return at;
        });
      });
    }

    return function update(text, now, reduced) {
      const next = text.words.join("");
      if (next !== key) {
        const immediate = !key || reduced;
        key = next;
        changed = immediate ? now - 1 : now;
        settled = false;
        const targets = layOut(text.words);
        for (let i = 0; i < Math.max(targets.length, letters.length); i++) {
          let w = letters[i];
          if (i >= targets.length) { w.toOpacity = 0; w.fromOpacity = w.opacity; w.fromX = w.x; w.fromY = w.y; continue; }
          const target = targets[i];
          if (!w) {
            w = { el: document.createElement("span") };
            container.append(w.el);
            letters.push(w);
          }
          const isNew = w.el.textContent !== target.word || w.toOpacity === 0;
          w.el.textContent = target.word;
          w.fromX = immediate ? target.x : isNew ? target.x + 7 : w.x;
          w.fromY = isNew || immediate ? target.y : w.y;
          w.fromOpacity = isNew && !immediate ? 0 : w.opacity ?? 1;
          w.toOpacity = 1;
          w.toX = target.x; w.toY = target.y;
        }
        container.style.color = text.prompt ? "#858585" : "";
      }
      if (settled) return;
      const f = reduced ? 1 : 1 - Math.pow(1 - clamp((now - changed) / .25), 3);
      for (const w of letters) {
        w.x = mix(w.fromX, w.toX, f); w.y = mix(w.fromY, w.toY, f);
        w.opacity = mix(w.fromOpacity, w.toOpacity, f);
        w.el.style.transform = `translate(${w.x}px, ${w.y}px)`;
        w.el.style.opacity = w.opacity;
        w.el.style.filter = w.opacity > .999 || w.opacity < .001 ? "" : `blur(${(1 - w.opacity) * 6}px)`;
      }
      if (f === 1) {
        while (letters.length && letters.at(-1).toOpacity === 0) letters.pop().el.remove();
        settled = true;
      }
    };
  }

  const scene = document.querySelector(".scene");
  const portrait = matchMedia("(max-aspect-ratio: 1/1)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const panels = [];
  let clock = 0, raf = 0, previous = null, sceneScale = 1;

  for (const kind of ["agent", "composer"]) {
    const card = scene.querySelector(`.${kind}`);
    const panel = {
      kind, particles: createVoiceParticles(card.querySelector("canvas"), {
        kind, scale: () => sceneScale * (kind === "agent" && portrait.matches ? 1.14 : 1)
      }),
      transcript: kind === "agent" ? makeTranscript(card.querySelector(".transcript")) : null,
      announcement: card.querySelector('[role="status"]'),
      statuses: [...card.querySelectorAll(".status span")], mode: null, frame: null, manual: null
    };
    panel.controls = makeControls(card, kind, mode => command(panel, mode));
    panels.push(panel);
  }

  function command(panel, mode) {
    const from = panel.frame;
    const active = mode !== "idle";
    const gate = active === from.gate.active ? from.gate : {
      active, at: clock, fromSplit: from.split, fromVelocity: from.splitVelocity, fromLevel: from.level
    };
    panel.manual = { mode, at: clock, gate, from };
    panel.announcement.textContent = {
      idle: "语音对话已结束", listening: "正在聆听", thinking: "正在思考"
    }[mode];
    renderPanel(panel);
    wake();
  }

  function manualFrame(panel) {
    const { mode, at, gate, from } = panel.manual;
    const elapsed = clock - at;
    const age = reduce.matches ? Infinity : elapsed;
    const phase = gate.active ? clock - gate.at : from.phase;
    const returning = mode === "listening" && from.mode === "thinking";
    const thinking = mix(from.thinking, Number(mode === "thinking"), smooth(0, returning ? .75 : .28, age));
    const thinkingAge = mode === "thinking" ? elapsed : from.thinkingAge + elapsed;
    function position(time) {
      if (mode === "thinking") {
        return mix(from.sweep, sweepAt(time, panel.kind), smooth(0, .18, reduce.matches ? Infinity : time));
      }
      return mix(.5, from.sweep, reduce.matches ? 0 : Math.exp(-3 * time));
    }
    const sweep = position(elapsed);
    const sweepTail = elapsed >= .18 ? position(elapsed - .18) : mix(from.sweepTail, from.sweep, elapsed / .18);
    const frame = gateFrame(gate, clock, reduce.matches, panel.kind);
    if (returning) frame.level *= listeningRecovery(age);
    const text = mode === "listening" ? sentence(reduce.matches ? 1.6 : phase) : from.text;
    return { ...frame, mode, phase, thinking, thinkingAge, sweep, sweepTail, text };
  }

  function renderPanel(p, force = false) {
    const f = p.manual ? manualFrame(p) : demoFrame(clock, p.kind, reduce.matches);
    f.kind = p.kind;
    f.reducedMotion = reduce.matches;
    f.time = reduce.matches ? 0 : f.phase;
    p.controls(f);
    p.transcript?.(f.text, clock, reduce.matches);
    if (p.mode !== f.mode) {
      p.statuses.forEach((span, ix) => span.classList.toggle("visible", ix === ["idle", "listening", "thinking"].indexOf(f.mode)));
      p.mode = f.mode;
    }
    if (force || !p.frame || f.level || p.frame.level || f.opening >= 0 || f.closing >= 0 || p.frame.closing >= 0) {
      p.particles.render(f);
    }
    p.frame = f;
  }

  function render(force = false) {
    for (const panel of panels) renderPanel(panel, force);
  }

  function tick(now) {
    raf = 0;
    if (previous !== null) clock += (now - previous) / 1000;
    previous = now;
    render();
    wake();
  }
  function wake() {
    const settledIdle = panels.every(p => p.manual?.mode === "idle" && clock - p.manual.at > 1.1);
    if (!raf && !document.hidden && !reduce.matches && !settledIdle) raf = requestAnimationFrame(tick);
    else if (!raf) previous = null;
  }
  function halt() {
    cancelAnimationFrame(raf);
    raf = 0; previous = null;
  }
  function resize() {
    const width = portrait.matches ? 1240 : 1600, height = portrait.matches ? 1150 : 1080;
    sceneScale = Math.min(innerWidth / width, innerHeight / height);
    scene.style.setProperty("--scale", sceneScale);
    render(true);
  }
  function motionPreference() {
    halt(); render(); wake();
  }
  document.addEventListener("visibilitychange", () => document.hidden ? halt() : wake());
  reduce.addEventListener("change", motionPreference);
  new ResizeObserver(resize).observe(document.querySelector(".viewport"));
  window.addEventListener("pagehide", e => {
    halt();
    if (!e.persisted) panels.forEach(p => p.particles.destroy());
  });
  window.addEventListener("pageshow", wake);
  resize(); wake();
})();
