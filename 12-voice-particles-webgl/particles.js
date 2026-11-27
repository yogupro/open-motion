(() => {
  "use strict";

  const vertex = `
    attribute vec2 position;
    uniform float band;
    void main() {
      gl_Position = vec4(position.x, (position.y + 1.0) * band - 1.0, 0.0, 1.0);
    }
  `;

  const fragment = `
    precision highp float;
    uniform vec2 resolution;
    uniform sampler2D colors;
    uniform float time, level, thinking, sweep, direction, agent;
    uniform vec3 rhythm;
    uniform vec2 trailMotion;

    float bell(float d) { return exp(-0.5 * d * d); }
    float hash(vec2 p) {
      vec3 q = fract(p.xyx * vec3(.1031, .1030, .0973));
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    vec3 palette(float p) {
      return texture2D(colors, vec2(fract(p), .5)).rgb;
    }

    void main() {
      // The lattice is fixed to the glass. Its illuminated cells change with the
      // moving envelopes, so the voice never looks like a stream of falling confetti.
      float columns = mix(149.0, 103.5, agent);
      float pitch = resolution.x / columns;
      vec2 pos = gl_FragCoord.xy / pitch;
      vec2 cell = floor(pos);
      float x = (cell.x + .5) / columns;
      float y = cell.y + .5;
      float seed = hash(cell);
      float checker = mod(cell.x + cell.y, 2.0);

      float phrase = rhythm.x, pulse = rhythm.y, colorTravel = rhythm.z;
      float early = smoothstep(.05, .95, -time);
      float center = sweep + (1.0 - thinking) *
        (.005 + .013 * agent + .036 * cos(time + .38) - (.036 + .013 * agent) * early);
      // The distance to the tip's earlier position sets how much of the wake
      // is still alight. At a turn the light contracts back into the curved lip.
      float drift = sweep - trailMotion.x;
      float travel = smoothstep(.008, mix(.25, .19, agent), abs(drift));
      float wake = -(x - center) * (abs(drift) > .005 ? sign(drift) : direction);
      float first = 1.0 - smoothstep(.58, .93, trailMotion.y);
      float entry = 1.0 - smoothstep(.26, .58, trailMotion.y);
      float listeningWidth = (.193 + .008 * agent) * (1.0 + .045 * pulse) * (1.0 - .18 * early);
      float rearWidth = mix(.175, .169, agent) + mix(.132, .182, agent) * travel;
      float sweepWidth = mix(.109, rearWidth, smoothstep(-.032, .075, wake));
      float width = mix(listeningWidth, sweepWidth, thinking);
      float distance = (x - center) / width;
      float voice = phrase * (1.0 + mix(.095, .064, agent) * pulse);
      voice *= 1.0 + .18 * agent * bell((time + .46) / .35);
      float maximum = mix(9.8, 17.8, agent);
      float sweepHeight = mix(5.65 - 1.37 * first, 4.2 + 1.0 * travel + 2.1 * entry, agent);
      float peak = mix(maximum * voice, sweepHeight, thinking) * level;
      float shape = bell(distance) * (1.0 + .035 * sin(17.0 * x - time * 2.5));
      float rise = peak * shape;

      // A separate inner ripple interlaces the outer checkerboard. The two
      // crests catch different colors and cross one another in little white glints.
      float inner = peak * (.56 + .09 * cos(x * 21.0 + time * 2.2)) *
        bell((x - center + .023 * sin(time * 2.0)) / (width * .91));
      float radius = mix(8.1, 17.0, agent);
      float edge = max(0.0, radius - min(pos.x, columns - pos.x));
      float floorRise = radius - sqrt(max(0.0, radius * radius - edge * edge));
      float localY = y - floorRise * mix(.20, 1.0, thinking);
      float surfaceNoise = (seed - .5) * 1.35;
      float outside = rise - localY + surfaceNoise - .28;
      float inside = inner - localY + surfaceNoise * .75;
      float alternate = mod(cell.y, 2.0);
      float stagger = alternate * (.9 + .9 * sin(x * 19.0 + time * 2.1)) *
        mix(1.0, .36, thinking);
      float coarse = smoothstep(-.54, .66, outside - stagger) * (1.0 - checker);
      float fine = smoothstep(-.65, .52, inside) * checker;
      // A few repeating cells just above the crest persist as dim afterimages.
      float sublattice = mod(cell.x + 2.0 * cell.y, 4.0);
      float crest = (1.0 - smoothstep(.25, 1.0, sublattice)) *
        exp(-.86 * max(0.0, -outside)) * (1.0 - checker) * .26 * smoothstep(.4, 2.1, rise);

      // During the thinking sweep, the receding crest leaves tiny irregular
      // colored embers along the whole bottom lip, including its curved ends.
      float ember = smoothstep(.60, .91, seed) * bell((localY - 1.5) / 2.1) * thinking;
      float river = x - colorTravel + .018 * sin(time * .9 + x * 11.0) +
        .010 * sin(cell.x * .36 + time * .8) + .017 * (seed - .5);
      river += .22 * max(0.0, 1.0 - 2.0 * x) * agent;
      float cross = smoothstep(.26, 1.02, localY / max(rise, .15));
      vec3 coat = palette(river + .006 * localY);
      float outerPhase = mix(.63 * (x - .5) + .04 + .024 * sin(12.0 * x - time) +
        .035 * sin(time * .47), river - .105 + .005 * localY, agent);
      vec3 top = palette(outerPhase);
      coat = mix(coat, top, cross * (1.0 - .76 * alternate));
      float warmTail = smoothstep(-.12, .24, x - center);
      vec3 sweepInk = mix(vec3(.07, .91, .83), vec3(.79, .29, .90), warmTail);
      sweepInk = mix(sweepInk, palette(river + .21), .16 + .52 * agent);
      coat = mix(coat, sweepInk, thinking);
      vec3 other = palette(river + .032 + .014 * sin(y - time));
      other = mix(other, mix(vec3(.70, .87, 1.0), sweepInk, .40), thinking);
      other *= .82 + .18 * sin(4.0 * y + time + x * 26.0);
      float seam = bell((localY - inner * .81) / max(.65, .20 * inner));
      vec3 pearl = vec3(.91, .94, 1.0);
      coat = mix(coat, pearl, .43 * seam * smoothstep(.55, 3.0, rise));
      other = mix(other, pearl, (.4 + .43 * seed) * seam);

      // Pixel coverage in lattice units keeps the square profile and thin
      // charcoal gutters legible at both poster and small mobile sizes.
      vec2 offset = abs(fract(pos) - .5);
      float square = max(offset.x, offset.y);
      float grain = .87 + .13 * seed;
      float flicker = sin(time * 2.8 + 6.283 * seed + .35 * cell.x);
      float sparkle = smoothstep(.15, .26, seed + .11 * flicker);
      float halfSize = mix(.337, .393, smoothstep(-.3, 2.0, inside));
      halfSize = mix(halfSize, .16 + seed * .09, ember * (1.0 - smoothstep(-1.0, 1.0, outside)));
      float aa = clamp(1.30 / pitch, .13, .27);
      float dotMask = 1.0 - smoothstep(halfSize - aa, halfSize + aa, square);
      float sx = pos.x / columns;
      float sy = pos.y - floorRise * mix(.20, 1.0, thinking);
      float spread = peak * bell((sx - center) / width) *
        (1.0 + .035 * sin(17.0 * sx - time * 2.5));
      float smoothInner = peak * (.56 + .09 * cos(sx * 21.0 + time * 2.2)) *
        bell((sx - center + .023 * sin(time * 2.0)) / (width * .91));
      float body = (1.0 - smoothstep(-1.1, 3.4, sy - spread)) * smoothstep(.15, 2.0, spread);
      float soft = bell(max(0.0, sy) / (spread * .57 + 1.0));
      float softSeam = bell((sy - smoothInner * .81) / (1.3 + .21 * smoothInner));
      vec3 glassTint = palette(sx - colorTravel + .018 * sin(time * .9 + sx * 11.0)
        + .22 * max(0.0, 1.0 - 2.0 * sx) * agent);
      glassTint = mix(glassTint, palette(outerPhase), smoothstep(.45, 1.3, sy / max(.1, spread)) * .55);
      glassTint = mix(glassTint, sweepInk, thinking);
      vec3 haze = mix(glassTint, vec3(.93, .90, .97), .27 + .22 * softSeam);
      vec3 glow = haze * ((.205 * soft + .17 * softSeam * body + .075 * body) *
        smoothstep(.15, 5.0, spread) + .012 * ember);
      vec3 cellLight = coat * ((.67 * coarse + crest) * grain) +
        other * ((.25 + .49 * sparkle) * fine * grain);
      cellLight *= (.75 + .25 * sparkle) * smoothstep(.22, 1.35, rise);
      // Local light spills beyond each square even where two opposing gutters meet.
      glow += cellLight * .078 * exp(-3.4 * dot(offset, offset));
      float glint = fine * seam * smoothstep(.42, .90, seed + .16 * flicker);
      cellLight += pearl * glint * (.18 + .14 * agent);
      cellLight += mix(vec3(.13, .48, .42), coat, .37) * ember * .67;
      float sweepLight = mix(.80 - .21 * first + .065 * travel,
        .48 + .12 * travel + .31 * entry, agent);
      sweepLight *= 1.0 - .31 * smoothstep(.13, .46, wake);
      float energy = mix(.672 + .024 * phrase + mix(.01, .035, agent) * pulse, sweepLight, thinking);
      vec3 emission = (glow + dotMask * cellLight) * energy * smoothstep(0.0, .38, level);
      float alpha = min(1.0, max(emission.r, max(emission.g, emission.b)) / .88);
      gl_FragColor = vec4(min(vec3(alpha), emission + .12 * alpha), alpha);
    }
  `;

  // Convolve the emitted light in a strip-sized target. The short kernel
  // diffuses the square edges and the wide one shares highlights with the
  // neighbouring cells, without softening the card or the controls.
  const diffusion = `
    precision highp float;
    uniform sampler2D light;
    uniform vec2 size;
    uniform float pitch;
    vec4 samples(vec2 uv, vec2 d) {
      return .25 * (texture2D(light, uv + d) + texture2D(light, uv - d) +
        texture2D(light, uv + vec2(-d.x, d.y)) + texture2D(light, uv + vec2(d.x, -d.y)));
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / size;
      vec2 unit = pitch / size;
      vec4 core = texture2D(light, uv);
      vec4 glass = .31 * core + .51 * samples(uv, .091 * unit) + .18 * samples(uv, .23 * unit);
      vec4 radiance = .57 * samples(uv, .41 * unit) + .43 * samples(uv, .84 * unit);
      gl_FragColor = min(vec4(1.0), glass + .14 * radiance * smoothstep(.06, .80, radiance.a));
    }
  `;

  function makeProgram(gl, pixelSource) {
    const program = gl.createProgram();
    const shaders = [];
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, pixelSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.bindAttribLocation(program, 0, "position");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }
  }

  function makeSpectrum(gl) {
    const stops = [
      [0, 255, 41, 139], [.07, 253, 39, 69], [.125, 255, 131, 12],
      [.16, 248, 188, 42], [.205, 3, 227, 149], [.25, 28, 200, 214],
      [.307, 47, 138, 255], [.355, 120, 98, 244], [.405, 38, 170, 242],
      [.47, 0, 251, 138], [.525, 8, 237, 205], [.60, 68, 177, 247],
      [.66, 171, 98, 247], [.727, 255, 66, 174], [.81, 243, 47, 179],
      [.875, 154, 51, 226], [.94, 213, 48, 198], [1, 255, 41, 139],
    ];
    const texels = new Uint8Array(256 * 4);
    let n = 1;
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      while (stops[n][0] < t) n++;
      const a = stops[n - 1], b = stops[n];
      const s = (t - a[0]) / (b[0] - a[0]);
      for (let j = 0; j < 3; j++) texels[i * 4 + j] = a[j + 1] + (b[j + 1] - a[j + 1]) * s;
      texels[i * 4 + 3] = 255;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, texels);
    return tex;
  }

  window.createVoiceParticles = function createVoiceParticles(canvas, options = {}) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
    let state, frame, previousSweep, direction = 1, disposed = false;
    let cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;

    function init() {
      if (!gl) return;
      const program = makeProgram(gl, fragment);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const uniforms = {};
      for (const key of ["band", "colors", "resolution", "time", "level", "thinking", "sweep", "direction", "agent", "rhythm", "trailMotion"]) {
        uniforms[key] = gl.getUniformLocation(program, key);
      }
      const composite = makeProgram(gl, diffusion);
      const surface = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, surface);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const target = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, surface, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      state = {
        program, buffer, uniforms, texture: makeSpectrum(gl), target, surface, composite,
        surfaceWidth: 0, surfaceHeight: 0, trails: window.createVoiceTrails?.(gl),
        optics: Object.fromEntries(["band", "light", "size", "pitch"].map(key => [key, gl.getUniformLocation(composite, key)])),
      };
    }

    function render(next = frame) {
      if (!next || disposed) return;
      frame = next;
      const active = Math.min(1, Math.max(0, frame.level));
      if (!state) {
        // Static light still identifies the listening state without GPU support.
        canvas.style.background = active > .04
          ? "radial-gradient(ellipse 42% 24% at 50% 113%, #7dfbdc 8%, #8870daaa 56%, transparent 100%)"
          : "none";
        return;
      }
      if (cssWidth <= 0 || cssHeight <= 0) return;
      const sceneScale = options.scale?.() ?? 1;
      const dpr = Math.min(2, (window.devicePixelRatio || 1) * sceneScale);
      const width = Math.max(1, Math.round(cssWidth * dpr)), height = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const agent = (frame.kind || options.kind) === "agent";
      const sweep = Number.isFinite(frame.sweep) ? frame.sweep : .5;
      if (previousSweep !== undefined && Math.abs(sweep - previousSweep) > .00001) direction = Math.sign(sweep - previousSweep);
      previousSweep = sweep;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (active > .0001) {
        const { program, buffer, uniforms, texture, target, surface, composite, optics } = state;
        const stripHeight = Math.min(height, Math.ceil(width * (agent ? .35 : .15)));
        gl.activeTexture(gl.TEXTURE0);
        if (width !== state.surfaceWidth || stripHeight !== state.surfaceHeight) {
          gl.bindTexture(gl.TEXTURE_2D, surface);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, stripHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          state.surfaceWidth = width;
          state.surfaceHeight = stripHeight;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, width, stripHeight);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniforms.colors, 0);
        gl.uniform1f(uniforms.band, 1);
        gl.uniform2f(uniforms.resolution, width, height);
        // The reference has a common 325 ms pulse beneath a much slower phrase.
        // Compute both once per draw so all illuminated rows breathe together.
        const phase = frame.phase ?? frame.time ?? 0;
        const t = frame.reducedMotion ? 0 : phase - (agent ? 2.55 : 2.47);
        const attack = Math.min(1, Math.max(0, (-t - .05) / 1.6));
        const pickup = (agent ? .009 : .074) * Math.min(1, attack * 2.6);
        const beat = 2 * Math.PI * (t - pickup) / .325;
        const pulse = Math.sin(beat) + .09 * Math.sin(2 * beat);
        const phrase = .971 + .119 * Math.cos(3.187 * t) + .064 * Math.sin(3.187 * t)
          - .107 * Math.cos(.8 * t) - .127 * Math.sin(.8 * t) - .35 * attack;
        const colorTravel = .111 * t + .008 * (Math.sin(2.75 * t + .1) - Math.sin(.1));
        gl.uniform1f(uniforms.time, t);
        gl.uniform3f(uniforms.rhythm, phrase, pulse, colorTravel);
        gl.uniform2f(uniforms.trailMotion, frame.sweepTail ?? sweep, frame.thinkingAge ?? 0);
        gl.uniform1f(uniforms.level, active);
        gl.uniform1f(uniforms.thinking, frame.thinking || 0);
        gl.uniform1f(uniforms.sweep, sweep);
        gl.uniform1f(uniforms.direction, direction);
        gl.uniform1f(uniforms.agent, Number(agent));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.useProgram(composite);
        gl.bindTexture(gl.TEXTURE_2D, surface);
        gl.uniform1i(optics.light, 0);
        gl.uniform1f(optics.band, stripHeight / height);
        gl.uniform2f(optics.size, width, stripHeight);
        gl.uniform1f(optics.pitch, width / (agent ? 103.5 : 149));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(0);
      }
      state.trails?.draw({ ...frame, width, height });
    }

    const observer = new ResizeObserver(([entry]) => {
      cssWidth = entry.contentRect.width;
      cssHeight = entry.contentRect.height;
      render();
    });
    const lost = event => { event.preventDefault(); state = null; render(); };
    const restored = () => { init(); canvas.style.background = ""; render(); };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    observer.observe(canvas);
    init();

    function destroy() {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      if (!state) return;
      state.trails?.destroy();
      gl.deleteTexture(state.texture);
      gl.deleteTexture(state.surface);
      gl.deleteFramebuffer(state.target);
      gl.deleteProgram(state.composite);
      gl.deleteBuffer(state.buffer);
      gl.deleteProgram(state.program);
      state = null;
    }
    return { render, destroy };
  };
})();
