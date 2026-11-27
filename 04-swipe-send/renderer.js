// One full-screen triangle. Distances in the shader use screen widths so that
// the luminous rim, arrow, and circular wave keep their shape on tall screens.
(() => {
  'use strict';

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUV;
    void main() {
      vUV = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    varying vec2 vUV;
    uniform float uPhase;
    uniform float uProgress;
    uniform float uTime;
    uniform float uAspect;
    uniform float uRadius;

    const vec3 black = vec3(0.006, 0.005, 0.013);

    float bell(float x) { return exp(-x * x); }

    float hash(vec2 p) {
      vec3 h = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
      h += dot(h, h.yzx + 33.33);
      return fract((h.x + h.y) * h.z);
    }

    float noise(vec2 p) {
      vec2 cell = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
                 mix(hash(cell + vec2(0, 1)), hash(cell + 1.0), f.x), f.y);
    }

    float insideGlass(vec2 uv) {
      vec2 halfSize = vec2(0.5, 0.5 * uAspect);
      vec2 p = abs((2.0 * uv - 1.0) * halfSize) - halfSize + uRadius;
      return max(0.0, uRadius - length(max(p, 0.0)) - min(max(p.x, p.y), 0.0));
    }

    vec3 review(vec2 uv, float pull) {
      float depth = insideGlass(uv);
      float lower = 1.0 - smoothstep(0.045, 0.295, uv.y);
      float ripple = 0.5 + 0.5 * sin(4.8 * uv.x + 2.8 * uv.y - 1.25 * uTime);
      vec3 lip = mix(vec3(0.39, 0.35, 0.95), vec3(0.05, 0.73, 1.0), ripple);
      float lilac = (1.0 - smoothstep(0.08, 0.75, uv.x)) *
                    (0.75 + 0.25 * cos(1.3 * uTime));
      lip = mix(lip, vec3(0.82, 0.68, 0.99), lilac);
      lip = mix(lip, vec3(0.27, 0.31, 0.89), pull * 0.66);
      float light = (0.56 * exp(-depth / 0.040) + 0.44 * exp(-depth / 0.095)) * lower;
      vec3 color = black + lip * light;
      color += vec3(0.040, 0.065, 0.12) * bell(uv.y / 0.15);

      color += pull * vec3(0.055, 0.067, 0.28) * bell((uv.y - 0.095) / 0.11);
      return color;
    }

    // Distance to a tapered brushstroke with a rounded end.
    float segment(vec2 p, vec2 a, vec2 b) {
      vec2 ab = b - a;
      float along = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
      return length(p - a - ab * along);
    }

    vec3 sending(vec2 uv, float p) {
      float sinceLaunch = max(0.0, p - 0.100);
      float tip = -0.043 + 0.40 * (1.0 - exp(-7.1 * sinceLaunch))
                        + 0.043 * p + 0.055 * smoothstep(0.87, 0.995, p);
      float angleTime = 3.4 * p;
      float x = uv.x - 0.5;
      float late = smoothstep(0.33, 0.90, p);
      float retract = smoothstep(0.955, 1.0, p);
      float arrowScale = (1.025 - 0.37 * late) * (1.0 - 0.48 * smoothstep(0.88, 0.98, p));

      // Broad, broken bands of light lead the arrow. The head is cambered
      // and its height and colour vary across the glass.
      float arch = 0.067 - 0.35 * x * x + 0.014 * sin(6.4 * x + angleTime);
      float head = tip + arch;
      float cloud = 0.5 + 0.5 * sin(8.8 * x - 6.0 * uv.y + 2.3 * angleTime +
                                      1.5 * sin(5.3 * uv.y + 4.0 * x));
      vec2 flow = vec2(4.1 * x + 0.9 * p, 8.6 * (uv.y - tip) - 1.4 * p);
      float eddy = noise(flow + vec2(cloud, 0.1));
      float foldNoise = noise(flow * 2.45 + vec2(1.7, -3.1));
      float horizon = min(0.595, tip + 0.205) + 0.032 * x + 0.020 * (eddy - 0.5);
      float top = 1.0 - smoothstep(horizon - 0.115, horizon + 0.009, uv.y);
      float lower = smoothstep(-0.19, 0.20, uv.y);
      float depth = max(0.0, head - uv.y);
      float bed = (0.43 + 0.56 * lower) * (0.72 + 0.28 * cloud);
      bed *= 1.0 - 0.27 * late;
      vec3 light = bed * vec3(0.22, 0.18, 0.71);
      float overCrest = smoothstep(head - 0.061, head + 0.074, uv.y);
      light *= 1.0 - 0.47 * overCrest;
      float highBand = bell((uv.y - head + 0.045) / 0.105);
      light += vec3(0.006, 0.079, 0.119) * highBand;
      float crest = bell((uv.y - head + 0.044) / 0.047);
      light += vec3(0.018, 0.18, 0.17) * crest * (0.37 + 0.63 * cloud);
      float cyan = bell((x - 0.12 - 0.08 * sin(angleTime)) / 0.23);
      light += cyan * vec3(0.0, 0.17, 0.22) * bell((uv.y - head - 0.065) / 0.10);
      float pink = bell((x - 0.30 - 0.06 * sin(2.7 * angleTime)) / 0.19);
      light += vec3(0.24, 0.055, 0.15) * pink * bell((uv.y - head - 0.045) / 0.12);

      // Long, soft folds trail behind the crest; their spread grows with
      // distance from the tip. They remain connected to the moving source.
      float drift = (0.064 * sin(13.0 * depth + 1.8 * angleTime) + 0.057 * (eddy - 0.5))
                    * smoothstep(0.0, 0.23, depth);
      float shaft = bell((x - drift) / (0.12 + 0.33 * depth));
      float aft = 1.0 - smoothstep(tip - 0.048, tip + 0.044, uv.y);
      float exhaust = aft * shaft * bell((uv.y - tip + 0.13) / (0.26 + 0.10 * late));
      light += exhaust * mix(vec3(0.24, 0.25, 0.38), vec3(0.24, 0.18, 0.28), late);
      float nearSource = bell((uv.y - tip + 0.075) / 0.22);
      float fold = bell((abs(x + 0.025 * sin(angleTime)) - (0.35 + 0.37 * depth)) / 0.12);
      light += vec3(0.14, 0.10, 0.31) * fold * nearSource * (1.0 - 0.64 * overCrest);
      float side = bell((x + 0.48 + 0.11 * sin(5.8 * uv.y + angleTime)) / 0.13);
      light += vec3(0.16, 0.15, 0.20) * side * bell((uv.y - tip + 0.09) / 0.23);
      float warm = bell((x - drift + 0.035) / 0.17) * bell((uv.y - tip + 0.105) / 0.115);
      light += vec3(0.14, 0.095, 0.10) * warm * aft;
      float blue = bell((x - 0.14 + 0.06 * sin(angleTime)) / 0.18) * nearSource;
      light += vec3(0.005, 0.085, 0.15) * blue * (1.0 - overCrest);

      // Small, coherent eddies tint the folds without dissolving their silhouette.
      float haze = (0.59 * eddy + 0.41 * foldNoise - 0.5) * nearSource;
      light += vec3(0.19, 0.14, 0.19) * haze;
      float cool = bell((x - drift - 0.097) / 0.145) * bell((uv.y - tip + 0.16) / 0.10);
      light += vec3(-0.012, 0.069, 0.12) * cool;
      float glint = bell((uv.y - head + 0.049 + 0.025 * (eddy - 0.5)) / 0.033);
      light += vec3(-0.026, 0.085, 0.058) * glint * (0.25 + 0.75 * cloud);
      float shade = 1.0 - 0.17 * smoothstep(-0.16, 0.43, x) * smoothstep(0.01, 0.22, depth);
      light *= shade;
      light.b *= 1.0 - 0.17 * bell((uv.y - tip - 0.017) / 0.095);
      vec2 a = vec2(x, (uv.y - tip) * uAspect) / arrowScale;
      a.y += (0.009 * sin(a.x * 27.0 + angleTime) + 0.014 * (foldNoise - 0.5))
             * smoothstep(0.015, 0.17, abs(a.x));
      float wing = segment(vec2(abs(a.x), a.y), vec2(0.0), vec2(0.237, -0.105));
      float stem = segment(a, vec2(0.0), vec2(-0.009, -0.195));
      float tail = 1.0 - smoothstep(0.055, 0.249, -a.y);
      float brushWidth = 0.031 + 0.009 * (1.0 - late) + 0.004 * sin(abs(a.x) * 19.0 - angleTime);
      float wingGlow = bell(wing / 0.067);
      float stemGlow = bell(stem / 0.078) * tail;
      float body = max(bell(wing / brushWidth), bell(stem / (brushWidth * 1.35)) * tail);
      float wingTip = clamp(a.x * 1.75, 0.0, 1.0);
      vec3 pearl = mix(vec3(0.86, 0.88, 0.98), vec3(0.81, 0.96, 1.0), wingTip);
      float visible = 1.0 - smoothstep(0.935, 0.982, p);
      light += visible * vec3(0.28, 0.21, 0.28) * max(wingGlow, stemGlow);
      light = mix(light, pearl, visible * body * 0.98);

      // Brief, offset cyan afterimage at launch. It slips down the trail
      // while the pearl-coloured arrow continues its ascent.
      float early = smoothstep(0.13, 0.24, p) * (1.0 - smoothstep(0.30, 0.47, p));
      float echo = segment(a, vec2(0.01, -0.135), vec2(0.225, -0.235));
      light = mix(light, vec3(0.16, 0.88, 1.0), 0.61 * early * bell(echo / (0.07 + 0.065 * eddy)));

      float closure = bell(x / max(0.21, 1.50 - 1.26 * retract)) *
                      bell((uv.y - 0.415) / max(0.045, 1.50 - 1.45 * retract));
      light *= mix(1.0, closure * (1.0 - 0.76 * retract), retract);
      float ignition = smoothstep(0.0, 0.14, p);
      vec3 result = black + top * light;
      if (ignition < 1.0) result = mix(review(uv, 1.0), result, ignition);
      return result;
    }

    vec3 receipt(vec2 uv, float t) {
      float d = insideGlass(uv);
      float edgeGain = smoothstep(0.28, 0.91, t);
      float angle = atan(uv.y - 0.5, uv.x - 0.5);
      float tint = max(0.0, cos(angle * 2.0 + 0.9 * uTime + 0.34 * sin(2.3 * angle)));
      vec3 glass = mix(vec3(0.56, 0.45, 1.0), vec3(0.04, 0.73, 1.0), pow(tint, 4.0));
      // A fine luminous line at the lip falls off into a deep violet bevel.
      vec3 rim = glass * (0.81 * exp(-d / 0.029) + 0.24 * exp(-d / 0.071));
      rim += vec3(0.32, 0.29, 0.33) * exp(-d / 0.012);
      rim += vec3(0.14, 0.07, 0.14) * (1.0 - smoothstep(0.01, 0.25, uv.y))
             * exp(-d / 0.041);
      vec3 color = black + rim * edgeGain;
      if (t < 0.96) {
        vec2 pos = vec2(uv.x - 0.5, (uv.y - 0.535) * uAspect);
        float theta = atan(pos.y, pos.x);
        float radius = 0.034 + 1.33 * t + 0.28 * (1.0 - exp(-6.0 * t));
        float shape = sin(5.0 * theta + 2.0 * t) + 0.43 * sin(9.0 * theta - 5.0 * t);
        float delta = length(pos) - radius + 0.024 * shape * smoothstep(0.0, 0.45, t);
        float chroma = 0.50 + 0.50 * cos(2.8 * theta + 0.9 + 6.0 * t);
        vec3 inner = mix(vec3(0.26, 0.22, 0.54), vec3(0.57, 0.34, 0.22), chroma);
        vec3 outer = mix(vec3(0.13, 0.18, 0.49), vec3(0.12, 0.46, 0.34), chroma);
        color += inner * bell((delta + 0.039) / 0.096) * 0.68;
        color += outer * bell((delta - 0.052) / 0.091) * 0.68;
      }
      return color;
    }

    void main() {
      vec3 color;
      if (uPhase < 0.5) color = review(vUV, uProgress);
      else if (uPhase < 1.5) color = sending(vUV, uProgress);
      else color = receipt(vUV, uProgress);
      float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      gl_FragColor = vec4(clamp(color + (grain - 0.5) / 255.0, 0.0, 1.0), 1.0);
    }
  `;

  function createProgram(gl) {
    const shaders = [];
    const program = gl.createProgram();
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  window.createSwipeRenderer = function createSwipeRenderer(canvas) {
    const gl = canvas.getContext('webgl', {
      alpha: true, depth: false, stencil: false, antialias: false, powerPreference: 'low-power'
    });
    let program;
    let buffer;
    let uniforms;
    let radius = 0.10;
    let aspect = 844 / 390;
    let state = { phase: 'review', progress: 0, time: 0 };
    let disposed = false;
    let previousFallback = '';

    function init() {
      if (!gl || gl.isContextLost()) return false;
      try {
        program = createProgram(gl);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.useProgram(program);
        const position = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        uniforms = Object.fromEntries(['uPhase', 'uProgress', 'uTime', 'uAspect', 'uRadius']
          .map(name => [name, gl.getUniformLocation(program, name)]));
        canvas.dataset.renderer = 'webgl';
        canvas.style.background = '';
        canvas.style.boxShadow = '';
        previousFallback = '';
        return true;
      } catch (error) {
        console.warn('Swipe Send WebGL:', error.message);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        buffer = program = null;
        return false;
      }
    }

    function fallback() {
      // Static, legible illumination is enough to preserve each interaction
      // state when a compositor refuses or temporarily loses a GL context.
      canvas.dataset.renderer = 'fallback';
      if (previousFallback === state.phase) return;
      previousFallback = state.phase;
      canvas.style.background = state.phase === 'sending'
        ? 'radial-gradient(ellipse 75% 40% at 50% 84%, #978df7 0, #5048a8 28%, #282a71 62%, transparent 100%), #020106'
        : state.phase === 'review'
          ? 'radial-gradient(ellipse 100% 23% at 50% 105%, #746cfc 4%, #213c77 50%, transparent 90%), #020106'
          : '#020106';
      canvas.style.boxShadow = state.phase === 'success' ? 'inset 0 0 7px #b5a4ff, inset 0 0 24px #534aaa' : '';
    }

    function draw(frame) {
      if (disposed) return;
      state = frame;
      if (!program) return fallback();
      gl.uniform1f(uniforms.uPhase, frame.phase === 'review' ? 0 : frame.phase === 'sending' ? 1 : 2);
      gl.uniform1f(uniforms.uProgress, frame.progress);
      gl.uniform1f(uniforms.uTime, frame.time);
      gl.uniform1f(uniforms.uAspect, aspect);
      gl.uniform1f(uniforms.uRadius, radius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function resize() {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const parent = canvas.parentElement;
      const cssRadius = parseFloat(getComputedStyle(parent).borderTopLeftRadius);
      radius = cssRadius / (parent.clientWidth || 390) || 0.10;
      aspect = rect.height / rect.width;
      if (program) gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      draw(state);
    }

    function onLost(event) {
      event.preventDefault();
      program = buffer = null;
      fallback();
    }

    function onRestored() {
      init();
      resize();
    }

    init();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    observer.observe(document.documentElement);
    window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    resize();

    return {
      draw,
      destroy() {
        disposed = true;
        observer.disconnect();
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
    };
  };
})();
