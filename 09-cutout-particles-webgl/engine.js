/**
 * Cutout Particles & Highlight Outline WebGL2 Engine
 *
 * Faithful WebGL2 port of yogu-word's cutout sequence:
 * 1. DustEffectShaders.metal -> Instanced rounded-quad sticker-tile peel dissolve
 * 2. CaptureContourSurface   -> Arc-length paced dual-layer (dot + glow) highlight outline emitter
 * 3. Analytical spring       -> Frame-rate independent subject lift & die-cut border reveal
 */

const TILE_PT = 12;
const DISSOLVE_DURATION = 4.0 / 2.2; // ~1.818s (CaptureDustRules.duration)
const CONTOUR_LOOP_SEC = 8.0;        // CAKeyframeAnimation duration = 8s
const DOT_RATE = 1700;
const DOT_LIFE = 2.2;
const DOT_CURVE = [0, 0.5, 0.8, 0.5, 0];
const GLOW_RATE = 30;
const GLOW_LIFE = 2.0;
const GLOW_CURVE = [0, 0.32, 0.4, 0.2, 0];

const DUST_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;        // 0..1 quad vertex
layout(location = 1) in vec2 aGridPos;     // (ix, iy)
layout(location = 2) in vec2 aOffset;      // offsetFromBasePosition in grid units
layout(location = 3) in vec3 aState;       // (spin, alpha, roundness)

uniform vec2 uGridSize;                    // (cols, rows)

out vec2 vUv;
out vec2 vLocal;
out float vAlpha;
out float vRoundness;

void main() {
  vLocal = aQuad;
  vUv = (aGridPos + aQuad) / uGridSize;

  float lift = clamp(length(aOffset) / 14.0, 0.0, 1.0);
  vec2 center = aGridPos + 0.5 + aOffset;
  vec2 local = (aQuad - 0.5) * (1.0 + 0.16 * lift);

  float c = cos(aState.x);
  float s = sin(aState.x);
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);

  vec2 normPos = (center + rotated) / uGridSize;
  vec2 ndc = normPos * 2.0 - 1.0;

  gl_Position = vec4(ndc, 0.0, 1.0);
  vAlpha = aState.y;
  vRoundness = aState.z;
}
`;

const DUST_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uPhoto;

in vec2 vUv;
in vec2 vLocal;
in float vAlpha;
in float vRoundness;

out vec4 fragColor;

void main() {
  if (vAlpha <= 0.001) discard;

  vec2 p = abs(vLocal * 2.0 - 1.0);
  float radius = vRoundness;
  vec2 q = p - (1.0 - radius);
  float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float sdfMask = 1.0 - smoothstep(-0.04, 0.02, sdf);
  // Keep resting tiles 100% seamless before lift begins; transition smoothly to rounded SDF on lift
  float mask = mix(1.0, sdfMask, smoothstep(0.0, 0.06, vRoundness));
  if (mask <= 0.001) discard;

  vec4 color = texture(uPhoto, vec2(vUv.x, 1.0 - vUv.y));
  float rim = smoothstep(0.08, 0.0, abs(sdf)) * vRoundness;
  color.rgb = mix(color.rgb, vec3(1.0, 0.97, 0.94), rim * 0.55);

  float finalAlpha = vAlpha * mask * color.a;
  fragColor = vec4(color.rgb * finalAlpha, finalAlpha);
}
`;

const SPARK_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;      // normalized 0..1 (top-left origin)
layout(location = 1) in float aSize;    // point size in device pixels
layout(location = 2) in float aAlpha;   // alpha 0..1
layout(location = 3) in float aKind;    // 0.0 = glow halo, 1.0 = crisp sparkle dot

out float vAlpha;
out float vKind;

void main() {
  vec2 ndc = vec2(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = aSize;
  vAlpha = aAlpha;
  vKind = aKind;
}
`;

const SPARK_FRAG = `#version 300 es
precision highp float;

in float vAlpha;
in float vKind;

out vec4 fragColor;

void main() {
  if (vAlpha <= 0.002) discard;

  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r = length(d);
  if (r > 1.0) discard;

  if (vKind < 0.5) {
    // Soft bloom glow sprite matching Original-glow@3x (72px -> 24pt * 1.9 = 45.6pt)
    float radial = exp(-r * r * 4.2) * (1.0 - smoothstep(0.55, 1.0, r));
    vec3 tint = vec3(1.0, 0.99, 0.97);
    float a = radial * 0.22 * vAlpha;
    fragColor = vec4(tint * a, a);
  } else {
    // Crisp soft-edged dot sprite matching Original-dot@3x (48px -> 16pt * 0.185 = 2.96pt)
    float radial = exp(-r * r * 3.4) * (1.0 - smoothstep(0.6, 1.0, r));
    vec3 tint = vec3(1.0, 0.995, 0.985);
    float a = radial * vAlpha;
    fragColor = vec4(tint * a, a);
  }
}
`;

const RIBBON_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;      // normalized 0..1 (top-left origin)
layout(location = 1) in float aTail;    // 0 = head, 1 = tail end

uniform float uAlpha;

out float vTail;

void main() {
  vec2 ndc = vec2(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  vTail = aTail;
}
`;

const RIBBON_FRAG = `#version 300 es
precision highp float;

uniform float uAlpha;
in float vTail;
out vec4 fragColor;

void main() {
  float headGlow = pow(1.0 - clamp(vTail, 0.0, 1.0), 1.8) * smoothstep(0.0, 0.06, vTail);
  float a = headGlow * uAlpha * 0.75;
  if (a <= 0.002) discard;
  fragColor = vec4(vec3(1.0, 0.99, 0.96) * a, a);
}
`;

function tausStep(z, s1, s2, s3, M) {
  const b = ((((z << s1) ^ z) >>> 0) >>> s2) >>> 0;
  return ((((z & M) << s3) >>> 0) ^ b) >>> 0;
}

/** Exact port of loki.metal Tausworthe PRNG */
class Loki {
  constructor(seed1, seed2 = 1, seed3 = 1) {
    const seed = Math.imul(seed1 >>> 0, 1099087573) >>> 0;
    const seedb = Math.imul(seed2 >>> 0, 1099087573) >>> 0;
    const seedc = Math.imul(seed3 >>> 0, 1099087573) >>> 0;

    let z1 = tausStep(seed, 13, 19, 12, 429496729);
    let z2 = tausStep(seed, 2, 25, 4, 4294967288);
    let z3 = tausStep(seed, 3, 11, 17, 429496280);
    let z4 = (Math.imul(1664525, seed) + 1013904223) >>> 0;

    let r1 = (z1 ^ z2 ^ z3 ^ z4 ^ seedb) >>> 0;
    z1 = tausStep(r1, 13, 19, 12, 429496729);
    z2 = tausStep(r1, 2, 25, 4, 4294967288);
    z3 = tausStep(r1, 3, 11, 17, 429496280);
    z4 = (Math.imul(1664525, r1) + 1013904223) >>> 0;

    r1 = (z1 ^ z2 ^ z3 ^ z4 ^ seedc) >>> 0;
    z1 = tausStep(r1, 13, 19, 12, 429496729);
    z2 = tausStep(r1, 2, 25, 4, 4294967288);
    z3 = tausStep(r1, 3, 11, 17, 429496280);
    z4 = (Math.imul(1664525, r1) + 1013904223) >>> 0;

    this.seed = ((z1 ^ z2 ^ z3 ^ z4) >>> 0) * 2.3283064365387e-10;
  }

  rand() {
    const hashed = Math.imul((this.seed >>> 0) || Math.floor(this.seed * 4294967296) >>> 0, 1099087573) >>> 0;
    const z1 = tausStep(hashed, 13, 19, 12, 429496729);
    const z2 = tausStep(hashed, 2, 25, 4, 4294967288);
    const z3 = tausStep(hashed, 3, 11, 17, 429496280);
    const z4 = (Math.imul(1664525, hashed) + 1013904223) >>> 0;
    const old = this.seed;
    this.seed = ((z1 ^ z2 ^ z3 ^ z4) >>> 0) * 2.3283064365387e-10;
    return old;
  }
}

function hash01(n) {
  let x = (n ^ 61) ^ (n >>> 16);
  x = Math.imul(x, 9);
  x ^= x >>> 4;
  x = Math.imul(x, 0x27d4eb2d);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

function evalCurve(vals, f) {
  if (f <= 0 || f >= 1) return 0;
  const x = f * (vals.length - 1);
  const i = Math.floor(x);
  const frac = x - i;
  return vals[i] + (vals[i + 1] - vals[i]) * frac;
}

/** Analytical closed-form damped spring (frame-rate independent) */
function stepSpring(state, target, stiffness, damping, dt) {
  const x0 = state.x - target;
  const v0 = state.v;
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);

  if (zeta < 0.9999) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * dt);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const B = (v0 + zeta * w0 * x0) / wd;
    state.x = target + decay * (x0 * cos + B * sin);
    state.v = decay * ((B * wd - x0 * zeta * w0) * cos - (x0 * wd + B * zeta * w0) * sin);
  } else {
    const decay = Math.exp(-w0 * dt);
    const B = v0 + w0 * x0;
    state.x = target + decay * (x0 + B * dt);
    state.v = decay * (v0 - w0 * B * dt);
  }
}

function buildArcContour(points) {
  const pts = points.slice();
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  }
  const acc = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) {
    acc[i] = acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const total = acc[acc.length - 1] || 1;

  function at(f) {
    const wrapped = ((f % 1) + 1) % 1;
    const dist = wrapped * total;
    let lo = 0;
    let hi = acc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (acc[mid] <= dist) lo = mid;
      else hi = mid;
    }
    const seg = Math.max(1e-6, acc[hi] - acc[lo]);
    const q = (dist - acc[lo]) / seg;
    return [
      pts[lo][0] + (pts[hi][0] - pts[lo][0]) * q,
      pts[lo][1] + (pts[hi][1] - pts[lo][1]) * q
    ];
  }

  return { pts, acc, total, at };
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error: ${log}`);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${log}`);
  }
  return prog;
}

export function computeAverageColor(img) {
  const S = 32;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, S, S);
  const data = ctx.getImageData(0, 0, S, S).data;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const n = S * S;
  for (let i = 0; i < data.length; i += 4) {
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
  }
  const r = Math.round(sr / n);
  const g = Math.round(sg / n);
  const b = Math.round(sb / n);
  return { r, g, b, css: `rgb(${r}, ${g}, ${b})` };
}

export function createCutoutController({
  dustCanvas,
  sparkCanvas,
  photoImg,
  contourPoints,
  onFrame,
  onPhaseChange
}) {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery.matches;

  const contour = buildArcContour(contourPoints);

  // State machine (faithful to yogu-word: preview -> identifying -> result)
  let autoLoop = true;

  // Timeline state
  let autoTimer = 0;
  let sparkTime = 3.2; // pre-warmed so comet tail is full on frame 0
  let dissolving = false;
  let dissolveElapsed = 0;
  let dissolveDone = false;
  let whiteEdgeVisible = false;
  let currentPhase = 'preview'; // 'preview' | 'identifying' | 'result'

  // Critically damped springs matching CaptureView.swift (.spring(response: 0.5, dampingFraction: 1))
  // w0 = 2*pi / 0.5 ≈ 12.566 -> stiffness ≈ 158, critical damping = 2*w0 ≈ 25.13
  const liftSpring = { x: 0, v: 0 };
  const edgeSpring = { x: 0, v: 0 };
  let sparkOpacity = 1;
  let photoBaseOpacity = 1;

  // Geometry & DPR
  let width = 360;
  let height = 480;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Dust particle simulation arrays
  let cols = 30;
  let rows = 40;
  let tileCount = 0;
  let pOffset = new Float32Array(0);
  let pVel = new Float32Array(0);
  let pLife = new Float32Array(0);
  let pSpin = new Float32Array(0);
  let pSpinVel = new Float32Array(0);
  let pDelay = new Float32Array(0);
  let gridPosData = new Float32Array(0);
  let instanceData = new Float32Array(0); // [ox, oy, spin, alpha, roundness]

  // Spark particle GPU buffer (max ~4200 particles * 5 floats)
  const MAX_SPARKS = 4400;
  const sparkVertexData = new Float32Array(MAX_SPARKS * 5);
  const RIBBON_SEGS = 120;
  const ribbonData = new Float32Array((RIBBON_SEGS + 1) * 3);

  // WebGL contexts
  let dustGL = null;
  let sparkGL = null;
  let dustRes = null;
  let sparkRes = null;
  let disposed = false;
  let rafId = 0;
  let lastNow = 0;

  function setPhase(next) {
    if (next !== currentPhase) {
      currentPhase = next;
      onPhaseChange?.(next);
    }
  }

  function initDustParticles() {
    const tile = TILE_PT;
    cols = Math.max(8, Math.ceil(width / tile));
    rows = Math.max(8, Math.ceil(height / tile));
    tileCount = cols * rows;

    pOffset = new Float32Array(tileCount * 2);
    pVel = new Float32Array(tileCount * 2);
    pLife = new Float32Array(tileCount);
    pSpin = new Float32Array(tileCount);
    pSpinVel = new Float32Array(tileCount);
    pDelay = new Float32Array(tileCount);
    gridPosData = new Float32Array(tileCount * 2);
    instanceData = new Float32Array(tileCount * 5);

    for (let gid = 0; gid < tileCount; gid++) {
      const ix = gid % cols;
      const iy = (gid / cols) | 0;
      gridPosData[gid * 2] = ix;
      gridPosData[gid * 2 + 1] = iy;

      const rng = new Loki(gid);
      const spread = (rng.rand() - 0.5) * 0.9;
      const speed = 34.0 + rng.rand() * 46.0;
      pOffset[gid * 2] = 0;
      pOffset[gid * 2 + 1] = 0;
      pVel[gid * 2] = Math.sin(spread) * speed;
      pVel[gid * 2 + 1] = (0.55 + rng.rand() * 0.45) * speed;
      pLife[gid] = 0.98 + rng.rand() * 0.42;
      pSpin[gid] = 0;
      pSpinVel[gid] = (rng.rand() - 0.5) * 3.6;
      pDelay[gid] = rng.rand() * 0.12;

      // Initial intact state
      instanceData[gid * 5 + 0] = 0;
      instanceData[gid * 5 + 1] = 0;
      instanceData[gid * 5 + 2] = 0;
      instanceData[gid * 5 + 3] = 1;
      instanceData[gid * 5 + 4] = 0;
    }

    if (dustGL && dustRes) {
      dustGL.bindBuffer(dustGL.ARRAY_BUFFER, dustRes.gridBuf);
      dustGL.bufferData(dustGL.ARRAY_BUFFER, gridPosData, dustGL.STATIC_DRAW);
      dustGL.bindBuffer(dustGL.ARRAY_BUFFER, dustRes.instBuf);
      dustGL.bufferData(dustGL.ARRAY_BUFFER, instanceData, dustGL.DYNAMIC_DRAW);
    }
  }

  function stepDustSimulation(dt) {
    dissolveElapsed += dt;
    const phase = dissolveElapsed * 2.2;
    const timeStep = dt * 2.0;
    const invCols = 1 / Math.max(cols - 1, 1);
    const invRows = 1 / Math.max(rows - 1, 1);

    for (let gid = 0; gid < tileCount; gid++) {
      const ix = gid % cols;
      const iy = (gid / cols) | 0;
      const across = ix * invCols;
      const up = iy * invRows;
      // Peel from bottom edge upward, then across
      const wave = up * 2.4 + across * 0.22;
      const start = wave + pDelay[gid];
      const wake = Math.max(0, Math.min(1, (phase - start) / 0.36));

      let ox = pOffset[gid * 2];
      let oy = pOffset[gid * 2 + 1];
      let life = pLife[gid];
      let spin = pSpin[gid];

      if (wake > 0) {
        const flutter = 1.0 + 0.12 * Math.sin(phase * 7.0 + gid * 0.37);
        const stepWake = timeStep * wake;
        ox += pVel[gid * 2] * stepWake * flutter;
        oy += pVel[gid * 2 + 1] * stepWake * flutter;
        pVel[gid * 2 + 1] += stepWake * 32.0;
        spin += pSpinVel[gid] * stepWake;
        life = Math.max(0, life - stepWake);

        pOffset[gid * 2] = ox;
        pOffset[gid * 2 + 1] = oy;
        pLife[gid] = life;
        pSpin[gid] = spin;
      }

      const lift = Math.min(1, Math.hypot(ox, oy) / 14.0);
      const alpha = Math.max(0, Math.min(0.28, life) / 0.28);
      const idx = gid * 5;
      instanceData[idx + 0] = ox;
      instanceData[idx + 1] = oy;
      instanceData[idx + 2] = spin;
      instanceData[idx + 3] = alpha;
      instanceData[idx + 4] = 0.28 * lift;
    }

    if (dissolveElapsed >= DISSOLVE_DURATION) {
      dissolving = false;
      dissolveDone = true;
      setPhase('result');
    }
  }

  function setupDustGL() {
    const gl = dustCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return false;
    dustGL = gl;

    const prog = createProgram(gl, DUST_VERT, DUST_FRAG);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const quadVerts = new Float32Array([
      0, 0,  1, 0,  0, 1,
      1, 0,  1, 1,  0, 1
    ]);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const gridBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 20, 8);
    gl.vertexAttribDivisor(3, 1);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photoImg);

    gl.bindVertexArray(null);

    dustRes = {
      prog,
      vao,
      quadBuf,
      gridBuf,
      instBuf,
      tex,
      uGridSize: gl.getUniformLocation(prog, 'uGridSize'),
      uPhoto: gl.getUniformLocation(prog, 'uPhoto')
    };

    return true;
  }

  function setupSparkGL() {
    const gl = sparkCanvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance'
    });
    if (!gl) return false;
    sparkGL = gl;

    // Point sprite program
    const prog = createProgram(gl, SPARK_VERT, SPARK_FRAG);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, sparkVertexData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);

    // Subtle luminous contour ribbon program
    const ribbonProg = createProgram(gl, RIBBON_VERT, RIBBON_FRAG);
    const ribbonVao = gl.createVertexArray();
    gl.bindVertexArray(ribbonVao);
    const ribbonBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ribbonBuf);
    gl.bufferData(gl.ARRAY_BUFFER, ribbonData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);

    sparkRes = {
      prog,
      vao,
      buf,
      ribbonProg,
      ribbonVao,
      ribbonBuf,
      uRibbonAlpha: gl.getUniformLocation(ribbonProg, 'uAlpha')
    };
    return true;
  }

  function renderDust() {
    if (!dustGL || !dustRes) return;
    const gl = dustGL;
    gl.viewport(0, 0, dustCanvas.width, dustCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!dissolving && dissolveDone) return;
    if (!dissolving && photoBaseOpacity > 0.99) return;

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(dustRes.prog);
    gl.bindVertexArray(dustRes.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, dustRes.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dustRes.tex);
    gl.uniform1i(dustRes.uPhoto, 0);
    gl.uniform2f(dustRes.uGridSize, cols, rows);

    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, tileCount);
    gl.bindVertexArray(null);
  }

  function renderSparks() {
    if (!sparkGL || !sparkRes) return;
    const gl = sparkGL;
    gl.viewport(0, 0, sparkCanvas.width, sparkCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (sparkOpacity <= 0.005) return;

    const invW = 1 / Math.max(width, 1);
    const invH = 1 / Math.max(height, 1);
    // Reference iPhone logical canvas width = 402pt (matches yogu-word CaptureView / dust_render)
    const ptScale = width / 402;
    let count = 0;

    // 1) Soft glow emitter: Original-glow (24pt * scale 1.9 = 45.6pt), emitterSize = 1pt, birthRate = 30/s
    const glowMin = Math.ceil((sparkTime - GLOW_LIFE) * GLOW_RATE);
    const glowMax = Math.floor(sparkTime * GLOW_RATE);
    const glowSize = Math.min(96, Math.max(16, 45.6 * ptScale * dpr));
    const glowJitterX = 1.0 * ptScale * invW;
    const glowJitterY = 1.0 * ptScale * invH;

    for (let n = glowMin; n <= glowMax && count < MAX_SPARKS; n++) {
      const tb = n / GLOW_RATE;
      const age = (sparkTime - tb) / GLOW_LIFE;
      const a = evalCurve(GLOW_CURVE, age) * sparkOpacity;
      if (a <= 0.004) continue;
      const [u, v] = contour.at(tb / CONTOUR_LOOP_SEC);
      const o = count * 5;
      sparkVertexData[o + 0] = u + (hash01(n * 2 + 11) - 0.5) * glowJitterX;
      sparkVertexData[o + 1] = v + (hash01(n * 2 + 12) - 0.5) * glowJitterY;
      sparkVertexData[o + 2] = glowSize;
      sparkVertexData[o + 3] = Math.min(1, a);
      sparkVertexData[o + 4] = 0.0;
      count++;
    }

    // 2) Crisp dot emitter: Original-dot (16pt * scale 0.185 = 2.96pt), emitterSize = 2pt, birthRate = 1700/s, opacity = 0.75
    const dotMin = Math.ceil((sparkTime - DOT_LIFE) * DOT_RATE);
    const dotMax = Math.floor(sparkTime * DOT_RATE);
    const dotSize = Math.max(2.0, 2.96 * ptScale * dpr);
    const dotJitterX = 2.0 * ptScale * invW;
    const dotJitterY = 2.0 * ptScale * invH;

    for (let n = dotMin; n <= dotMax && count < MAX_SPARKS; n++) {
      const tb = n / DOT_RATE;
      const age = (sparkTime - tb) / DOT_LIFE;
      // Calibrated for additive accumulation (~15 overlapping dots per px at 1700/s)
      const a = evalCurve(DOT_CURVE, age) * 0.75 * 0.14 * sparkOpacity;
      if (a <= 0.002) continue;
      const [u, v] = contour.at(tb / CONTOUR_LOOP_SEC);
      const o = count * 5;
      sparkVertexData[o + 0] = u + (hash01(n * 2 + 101) - 0.5) * dotJitterX;
      sparkVertexData[o + 1] = v + (hash01(n * 2 + 102) - 0.5) * dotJitterY;
      sparkVertexData[o + 2] = dotSize;
      sparkVertexData[o + 3] = Math.min(1, a);
      sparkVertexData[o + 4] = 1.0;
      count++;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // Pure additive luminous glow

    // Draw exact two yogu-word emitter layers (glow + dot)
    if (count > 0) {
      gl.useProgram(sparkRes.prog);
      gl.bindVertexArray(sparkRes.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, sparkRes.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sparkVertexData.subarray(0, count * 5));
      gl.drawArrays(gl.POINTS, 0, count);
    }

    gl.bindVertexArray(null);
  }

  function resize(w, h) {
    width = Math.max(120, Math.round(w));
    height = Math.max(160, Math.round(h));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);

    if (dustCanvas.width !== bw || dustCanvas.height !== bh) {
      dustCanvas.width = bw;
      dustCanvas.height = bh;
    }
    if (sparkCanvas.width !== bw || sparkCanvas.height !== bh) {
      sparkCanvas.width = bw;
      sparkCanvas.height = bh;
    }

    if (!dissolving) {
      initDustParticles();
    }
  }

  function resetToPreview() {
    dissolving = false;
    dissolveDone = false;
    dissolveElapsed = 0;
    whiteEdgeVisible = false;
    photoBaseOpacity = 1;
    autoTimer = 0;
    initDustParticles();
    setPhase('preview');
  }

  function confirmCutout() {
    initDustParticles();
    dissolving = true;
    dissolveDone = false;
    dissolveElapsed = 0;
    whiteEdgeVisible = false;
    photoBaseOpacity = 0;
    setPhase('identifying');
  }

  function tick(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);

    const dt = lastNow ? Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000)) : 1 / 60;
    lastNow = now;

    if (reducedMotion) {
      const isResult = currentPhase !== 'preview';
      sparkOpacity = isResult ? 0 : 1;
      liftSpring.x = isResult ? 1 : 0;
      edgeSpring.x = isResult ? 1 : 0;
      photoBaseOpacity = isResult ? 0 : 1;
      dissolving = false;
      dissolveDone = isResult;
      renderDust();
      renderSparks();
      onFrame?.({
        photoOpacity: photoBaseOpacity,
        lift: liftSpring.x,
        edgeProgress: edgeSpring.x,
        dissolveProgress: dissolveDone ? 1 : 0,
        phase: currentPhase,
        tileCount
      });
      return;
    }

    // Advance contour highlight shimmer continuously
    sparkTime += dt;

    // Faithful yogu-word auto-cycle:
    // 0.0s .. 2.8s: preview (full photo + dual-layer highlight outline shimmer)
    // 2.8s .. 4.62s: identifying (dust peel dissolve + subject spring lift; +0.35s white border appears)
    // 4.62s .. 7.0s: result (isolated white-bordered sticker on CIAreaAverage backdrop)
    if (autoLoop) {
      autoTimer += dt;
      if (autoTimer < 2.8) {
        if (currentPhase !== 'preview') {
          resetToPreview();
        }
      } else if (autoTimer < 2.8 + DISSOLVE_DURATION + 2.4) {
        if (!dissolving && !dissolveDone) {
          confirmCutout();
        }
      } else {
        resetToPreview();
      }
    }

    // Step particle dissolve simulation
    if (dissolving) {
      stepDustSimulation(dt);
      // AppModel.swift: 350ms after confirmCapture(), white sticker outline becomes visible
      if (dissolveElapsed >= 0.35) {
        whiteEdgeVisible = true;
      }
    }

    // Highlight outline exits swiftly when confirmCapture() starts (!dropping)
    const dampSpark = 1 - Math.exp(-16 * dt);
    const targetSparkOpacity = currentPhase === 'preview' ? 1.0 : 0.0;
    sparkOpacity += (targetSparkOpacity - sparkOpacity) * dampSpark;

    // Critically damped spring (.spring(response: 0.5, dampingFraction: 1)) for subject move/lift
    const targetLift = currentPhase === 'preview' ? 0 : 1;
    const targetEdge = whiteEdgeVisible ? 1 : 0;
    stepSpring(liftSpring, targetLift, 158, 25.13, dt);
    stepSpring(edgeSpring, targetEdge, 260, 28, dt);

    renderDust();
    renderSparks();

    onFrame?.({
      photoOpacity: photoBaseOpacity,
      lift: liftSpring.x,
      edgeProgress: Math.max(0, Math.min(1.08, edgeSpring.x)),
      dissolveProgress: dissolveDone ? 1 : Math.min(1, dissolveElapsed / DISSOLVE_DURATION),
      phase: currentPhase,
      tileCount
    });
  }

  function handleVisibility() {
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    } else if (!disposed && !rafId) {
      lastNow = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function handleReducedMotion(e) {
    reducedMotion = e.matches;
  }

  function handleContextLost(e) {
    e.preventDefault();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function handleContextRestored() {
    setupDustGL();
    setupSparkGL();
    initDustParticles();
    if (!disposed && !rafId) {
      lastNow = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  const okDust = setupDustGL();
  const okSpark = setupSparkGL();
  initDustParticles();

  dustCanvas.addEventListener('webglcontextlost', handleContextLost);
  dustCanvas.addEventListener('webglcontextrestored', handleContextRestored);
  sparkCanvas.addEventListener('webglcontextlost', handleContextLost);
  sparkCanvas.addEventListener('webglcontextrestored', handleContextRestored);
  document.addEventListener('visibilitychange', handleVisibility);
  reducedMotionQuery.addEventListener('change', handleReducedMotion);

  lastNow = performance.now();
  rafId = requestAnimationFrame(tick);

  return {
    webglSupported: okDust && okSpark,
    resize,
    update(patch = {}) {
      if (patch.autoLoop !== undefined) {
        autoLoop = Boolean(patch.autoLoop);
        if (autoLoop && currentPhase === 'result') {
          autoTimer = 2.8 + DISSOLVE_DURATION + 1.4;
        }
      }
    },
    confirm() {
      autoTimer = 2.8;
      confirmCutout();
    },
    reset() {
      resetToPreview();
    },
    primaryAction() {
      if (currentPhase === 'preview') {
        autoTimer = 2.8;
        confirmCutout();
      } else {
        resetToPreview();
      }
    },
    destroy() {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibility);
      reducedMotionQuery.removeEventListener('change', handleReducedMotion);
      dustCanvas.removeEventListener('webglcontextlost', handleContextLost);
      dustCanvas.removeEventListener('webglcontextrestored', handleContextRestored);
      sparkCanvas.removeEventListener('webglcontextlost', handleContextLost);
      sparkCanvas.removeEventListener('webglcontextrestored', handleContextRestored);

      if (dustGL && dustRes) {
        dustGL.deleteTexture(dustRes.tex);
        dustGL.deleteBuffer(dustRes.quadBuf);
        dustGL.deleteBuffer(dustRes.gridBuf);
        dustGL.deleteBuffer(dustRes.instBuf);
        dustGL.deleteVertexArray(dustRes.vao);
        dustGL.deleteProgram(dustRes.prog);
      }
      if (sparkGL && sparkRes) {
        sparkGL.deleteBuffer(sparkRes.buf);
        sparkGL.deleteBuffer(sparkRes.ribbonBuf);
        sparkGL.deleteVertexArray(sparkRes.vao);
        sparkGL.deleteVertexArray(sparkRes.ribbonVao);
        sparkGL.deleteProgram(sparkRes.prog);
        sparkGL.deleteProgram(sparkRes.ribbonProg);
      }
    }
  };
}
