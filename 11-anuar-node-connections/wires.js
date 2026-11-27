// The strip carries signed distance across the cable and arc length along it.
// The same length drives retraction, the travelling head, and the afterimage.
const vertexSource = `
attribute vec4 a_vertex;
uniform vec2 u_screen;
uniform vec3 u_camera;
uniform vec4 u_quad;
uniform mediump int u_kind;
varying vec2 v_local;
void main() {
  vec2 world = a_vertex.xy;
  v_local = a_vertex.zw;
  if (u_kind != 0) {
    v_local = a_vertex.xy * u_quad.zw;
    world = u_quad.xy + v_local;
  }
  vec2 screen = (world * u_camera.z + u_camera.xy) / u_screen;
  gl_Position = vec4(screen.x * 2.0 - 1.0, 1.0 - screen.y * 2.0, 0., 1.);
}
`;

const fragmentSource = `
precision highp float;
uniform mediump int u_kind;
uniform float u_time;
uniform vec4 u_wire; // length, visible fraction, pulse phase, direction
uniform float u_anchorEnd;
uniform vec2 u_latch; // snap intensity, source end was latched
uniform vec3 u_port; // attached, packet intensity, strength
uniform vec4 u_node; // half width, half height, arrival time, entry side
uniform float u_flash;
varying vec2 v_local;

float bell(float d, float width) {
  float q = d / width;
  return exp(-q*q);
}

vec3 cable() {
  float arc = v_local.x;
  float d = v_local.y;
  float t = arc / u_wire.x;
  if (mix(t, 1.-t, u_anchorEnd) > u_wire.y) discard;
  // A fine guide filament stays on the path. The surrounding fibres meander
  // independently, then taper back towards the contacts.
  float spread = .35 + .65 * pow(max(0., sin(3.14159265 * t)), .52);
  float phase = arc * .024 - u_time * 1.6;
  float drift = sin(.73 * phase + 1.1);
  float f1 = spread * (2.8 * sin(phase) + 1.1 * sin(1.7 * phase));
  float f2 = spread * (5.1 * drift + 1.8 * sin(1.27*phase + 2.4));
  float f3 = spread * (7.5 * sin(.82 * phase + 3.7) + .7*sin(1.9*phase));
  float grain = fract(sin(dot(floor(vec2(arc * 1.5,d * 2.)),vec2(.0113,.1047))) * 4375.8);
  float shimmer = .94 + .06 * grain + .045 * sin(arc * .13 - u_time * 1.9);
  vec3 rgb = vec3(.45,.48,.52) * bell(d,1.22)
           + vec3(.085,.097,.135) * bell(d,3.6)
           + vec3(.048,.050,.110) * bell(d,8.6)
           + vec3(.010,.008,.036) * bell(d,14.8);
  rgb += vec3(.19,.20,.24) * bell(d-f1,.74);
  rgb += vec3(.11,.12,.18) * bell(d-f2,.79);
  rgb += vec3(.055,.058,.11) * bell(d-f3,.85);
  rgb += vec3(.073,.080,.113) * bell(d-f1,2.7) + vec3(.026,.028,.073) * bell(d-f2,3.1);
  rgb *= shimmer;
  if (u_latch.x > 0.) {
    // Closing the contact lights the existing fibres simultaneously. Only its
    // spatial falloff points to the socket that was just reconnected.
    float nearSocket = mix(t,1.-t,u_latch.y);
    float intensity = u_latch.x * (.31 + .24*nearSocket + .45*pow(nearSocket,3.));
    vec3 silver = vec3(.48,.55,.60) * bell(d,2.3)
                + vec3(.23,.27,.45) * bell(d,5.5)
                + vec3(.085,.10,.22) * bell(d,13.)
                + vec3(.24,.28,.42) * (bell(d-f1,1.) + .65*bell(d-f2,1.1));
    rgb += silver * intensity;
  }
  if (u_wire.z >= 0.) {
    float along = u_wire.w > 0. ? arc : u_wire.x - arc;
    float behind = u_wire.z * u_wire.x - along;
    // The front has an elliptical nose, broad in its wake and round at the tip.
    float ahead = max(0., -behind);
    float nose = bell(ahead,12.);
    float fade = exp(-max(0.,behind) / 104.);
    float tail = nose * fade;
    float head = bell(behind,19.);
    float mist = 1. + .13 * sin(.19*d + .04*arc - 1.3*u_time) + .07*(grain-.5);
    vec3 light = vec3(.84,.60,.85) * nose * exp(-max(0.,behind)/130.) * bell(d,2.05)
               + vec3(.45,.20,.42) * tail * bell(d,6.4)
               + vec3(.355,.090,.28) * tail * mist * bell(d,14.)
               + vec3(.094,.013,.065) * tail * mist * bell(d,22.)
               + vec3(.30,.55,.44) * head * bell(d,6.4)
               + vec3(.15,.13,.17) * head * bell(d,8.6);
    // The strands remain distinct in the wake. Each peeled fibre has its own
    // crest, width and lead, so their tips land at different points on the nose.
    for (int i=0; i<8; i++) {
      float n = float(i);
      float side = mod(n, 2.) * 2. - 1.;
      float k = floor(n * .5);
      float twist = phase * (.85 + .09*k) + n*2.17;
      float lane = 3.3 + k*3.8 + (1.+.28*k)*sin(twist) + .65*sin(2.4*twist);
      float fan = .76 + .24 * smoothstep(-6.,31.+k*3.,behind);
      float shift = side * fan * lane + .2 * sin(arc*.19 + n);
      float envelope = fade * bell(max(0., -behind + 2.7*k + 1.7*sin(n)), 6.);
      float spark = .72 + .28*sin(twist+2.3) + .20*(grain-.5);
      float band = (.36 - .060*k) * envelope * spark;
      light += vec3(1.,.59,.84) * band * bell(d-shift,.73+k*.06);
      light += vec3(.38,.16,.26) * band * bell(d-shift,2.4);
    }
    // Optical screen blend keeps the coloured halo visible across the bright
    // blue core without clipping the entire packet to opaque white.
    rgb += (1.-min(rgb,vec3(1.))) * min(light,vec3(1.));
  }
  return rgb;
}

vec3 socket() {
  vec2 p = v_local;
  float r = length(p);
  float glow = u_port.y;
  float attached = u_port.x;
  vec3 rgb = vec3(.66,.73,.83) * bell(r,4.0)
           + vec3(.16,.18,.29) * bell(r,7.4)
           + vec3(.032,.040,.11) * bell(r,13.);
  // Narrow vertical caustic where the cable meets the glass, with a much
  // shorter horizontal ray at free tips.
  rgb += vec3(.64,.67,.84) * bell(p.x,1.05) * bell(p.y,36.) * attached;
  rgb += vec3(.105,.12,.25) * bell(p.x,2.95) * bell(p.y,30.) * attached;
  rgb += vec3(.16,.18,.24) * bell(p.y,1.2) * bell(p.x,9.);
  rgb += vec3(.65,.23,.48) * glow * bell(p.x,1.9) * bell(p.y,44.) * attached;
  rgb += vec3(.26,.049,.22) * glow * bell(p.x,6.4) * bell(p.y,41.) * attached;
  rgb += u_latch.x * (vec3(.66,.73,.80) * bell(r,5.2)
                     + vec3(.25,.34,.50) * bell(r,11.)
                     + vec3(.085,.105,.25) * bell(r,21.)
                     + attached * vec3(.63,.67,.80) * bell(p.x,1.6) * bell(p.y,58.)
                     + attached * vec3(.17,.19,.32) * bell(p.x,4.1) * bell(p.y,43.));
  return rgb * u_port.z;
}

vec4 rim() {
  const float radius = 10.;
  vec2 b = u_node.xy;
  vec2 p = vec2(v_local.x * u_node.w, abs(v_local.y));
  vec2 q = abs(p) - b + radius;
  float sd = length(max(q,0.)) + min(max(q.x, q.y), 0.) - radius;
  float arcCorner = radius * 1.57079633;
  float run = b.y-radius;
  float across = 2.*(b.x-radius);
  float halfLoop = 2.*run + across + 2.*arcCorner;
  float s;
  if (q.x > 0. && q.y > 0.) {
    float theta = atan(q.y, q.x) * radius;
    s = run + (p.x < 0. ? theta : 2.*arcCorner + across-theta);
  } else if (q.x > q.y) {
    s = p.x < 0. ? p.y : halfLoop-p.y;
  } else {
    s = run+arcCorner+p.x+b.x-radius;
  }
  // Two fronts depart the entry port and meet halfway round the card.
  float age = u_node.z >= 0. ? u_node.z - s/(3.04*halfLoop) : .075;
  float onset = smoothstep(-.017,.025,age);
  float hot = onset * exp(-8.9*max(0.,age-.030));
  float crest = onset * bell(age-.063,.042);
  float cool = onset * exp(-2.05*max(age,0.));
  float energy = u_node.z >= 0. ? 1. : u_flash;
  // The bloom leads the luminous line; most of the white-pink is confined
  // to the moving crest and the source contact, not the entire charged rim.
  float mist = smoothstep(-.070,.028,age) * exp(-9.2*max(0.,age-.035));
  float contact = bell(s,55.) * exp(-2.9*max(0.,u_node.z));
  float noise = fract(sin(dot(floor(v_local),vec2(.131,.054))) * 3197.9);
  float grain = .978+.044*noise;
  vec3 rgb = vec3(.18,.23,.33) * cool * bell(sd,1.25)
           + vec3(.034,.048,.10) * cool * bell(sd,4.8)
           + vec3(.42,.11,.30) * hot * bell(sd,1.2)
           + vec3(.31,.36,.34) * crest * bell(sd,1.55)
           + vec3(.20,.059,.15) * mist * bell(sd,4.3)
           + vec3(.14,.024,.10) * mist * bell(sd,10.3)
           + vec3(.11,.056,.088) * crest * bell(sd,7.2)
           + vec3(.065,.007,.040) * mist * bell(sd,15.7)
           + vec3(.61,.29,.44) * contact * bell(sd,1.5)
           + vec3(.29,.061,.21) * contact * bell(sd,5.2);
  rgb *= grain;
  vec3 color = energy * rgb;
  return vec4(color, min(1., max(color.r, max(color.g, color.b))));
}

void main() {
  if (u_kind == 2) {
    gl_FragColor = rim();
  } else {
    vec3 color = u_kind == 0 ? cable() : socket();
    gl_FragColor = vec4(color, min(1., max(color.r, max(color.g, color.b))));
  }
}
`;

const stripHalfWidth = 33;

function mixPoint(a, b, t) {
  return { x: a.x + (b.x - a.x)*t, y: a.y + (b.y - a.y)*t };
}

function splitCubic([a,b,c,d], t) {
  const ab = mixPoint(a,b,t), bc = mixPoint(b,c,t), cd = mixPoint(c,d,t);
  const left = mixPoint(ab,bc,t), right = mixPoint(bc,cd,t);
  const center = mixPoint(left,right,t);
  return [[a,ab,left,center], [center,right,cd,d]];
}

function cableSpans(from, to, sideRoute) {
  const reach = Math.max(20, Math.abs(to.x-from.x)*.36 + Math.abs(to.y-from.y)*.34);
  const direct = [from,{x:from.x+reach,y:from.y},{x:to.x-reach,y:to.y},to];
  if (!sideRoute || sideRoute.blend === 0) return [direct];

  // A cable doubling back between stacked cards stays in the side gutters
  // until it can cross the clear space between the two card faces.
  const { gapY, direction } = sideRoute;
  const lift = Math.min(22, (sideRoute.gapHeight ?? 68)*.32,
    Math.abs(gapY-from.y)*.35, Math.abs(to.y-gapY)*.35);
  const right = from.x+20, left = to.x-20;
  const entry = { x:right, y:gapY-direction*lift };
  const exit = { x:left, y:gapY+direction*lift };
  const middle = { x:(right+left)/2, y:gapY };
  const rightTurn = { x:right, y:gapY }, leftTurn = { x:left, y:gapY };
  // Each bend starts and ends at zero curvature. This keeps the width
  // of the optical strip continuous where the bend meets the side run.
  const routed = [
    [from,{x:right,y:from.y},{x:right,y:entry.y-direction*lift*1.5},entry],
    [entry,rightTurn,rightTurn,middle],
    [middle,leftTurn,leftTurn,exit],
    [exit,{x:left,y:exit.y+direction*lift*1.5},{x:left,y:to.y},to],
  ];
  const blend = sideRoute.blend ?? 1;
  if (blend === 1) return routed;

  // Match the number of spans before interpolating so the cable changes
  // shape continuously as a loose end approaches or leaves a stacked row.
  const [firstHalf, lastHalf] = splitCubic(direct,.5);
  const directSpans = [...splitCubic(firstHalf,.6), ...splitCubic(lastHalf,.4)];
  return directSpans.map((span,i) =>
    span.map((point,j) => mixPoint(point,routed[i][j],blend)));
}

function makeCable(from, to, sideRoute) {
  const spans = cableSpans(from,to,sideRoute);
  const path = [];
  let length = 0;
  let previous = from;
  for (const [a,b,c,d] of spans) {
    const steps = Math.max(32, Math.min(200, Math.ceil((Math.abs(d.x-a.x) + Math.abs(d.y-a.y)) / 3)));
    const endX = d.x-a.x, endY = d.y-a.y;
    const bX = b.x-a.x, bY = b.y-a.y, cX = c.x-a.x, cY = c.y-a.y;
    for (let i = path.length ? 1 : 0; i <= steps; i++) {
      const t = i/steps, u = 1-t;
      const x = a.x + 3*u*u*t*bX + 3*u*t*t*cX + t*t*t*endX;
      const y = a.y + 3*u*u*t*bY + 3*u*t*t*cY + t*t*t*endY;
      const vx = 3*(u*u*bX + 2*u*t*(cX-bX) + t*t*(endX-cX));
      const vy = 3*(u*u*bY + 2*u*t*(cY-bY) + t*t*(endY-cY));
      const speed = Math.hypot(vx,vy) || 1;
      const ax = 6*(u*(cX-2*bX) + t*(endX-2*cX+bX));
      const ay = 6*(u*(cY-2*bY) + t*(endY-2*cY+bY));
      const curvature = (vx*ay-vy*ax)/(speed*speed*speed);
      length += Math.hypot(x-previous.x,y-previous.y);
      const radius = Math.min(stripHalfWidth,.88/Math.abs(curvature));
      previous = { x, y, length, nx:-vy/speed, ny:vx/speed,
        low:curvature < 0 ? -radius : -stripHalfWidth,
        high:curvature > 0 ? radius : stripHalfWidth };
      path.push(previous);
    }
  }
  if (sideRoute) {
    // At tight gutter turns the inside normals may meet within a single
    // triangle. Stop both cross sections short of their shared intersection.
    for (let i = 1; i < path.length; i++) {
      const p = path[i-1], q = path[i];
      const det = p.nx*q.ny - p.ny*q.nx;
      if (Math.abs(det) < 1e-6) continue;
      const dx = q.x-p.x, dy = q.y-p.y;
      const sp = .88*(dx*q.ny-dy*q.nx)/det;
      const sq = .88*(dx*p.ny-dy*p.nx)/det;
      if (sp > 0) p.high = Math.min(p.high,sp);
      else p.low = Math.max(p.low,sp);
      if (sq > 0) q.high = Math.min(q.high,sq);
      else q.low = Math.max(q.low,sq);
    }
  }
  const vertices = new Float32Array(path.length*8);
  let offset = 0;
  for (const p of path) {
    for (const dist of [p.low,p.high]) {
      vertices[offset++] = p.x+p.nx*dist;
      vertices[offset++] = p.y+p.ny*dist;
      vertices[offset++] = p.length;
      vertices[offset++] = dist;
    }
  }
  return { path, length, vertices };
}

function pointAt(cable, t) {
  const d = t*cable.length;
  const points = cable.path;
  let lo = 0;
  let hi = points.length-1;
  while (hi-lo>1) {
    const mid = (lo+hi)>>1;
    if (points[mid].length < d) lo = mid;
    else hi = mid;
  }
  const a = points[lo], b = points[hi];
  const f = (d-a.length)/(b.length-a.length || 1);
  return mixPoint(a,b,f);
}

function cableCache() {
  const entries = [];
  return (i, link) => {
    const {from, to, sideRoute} = link;
    const key = [from.x,from.y,to.x,to.y,sideRoute?.gapY,sideRoute?.direction,sideRoute?.gapHeight,sideRoute?.blend].join(',');
    if (entries[i]?.key !== key) entries[i] = { key, ...makeCable(from,to,sideRoute) };
    return entries[i];
  };
}

function makeProgram(gl) {
  const program = gl.createProgram();
  const shaders = [];
  try {
    for (const [type,source] of [[gl.VERTEX_SHADER,vertexSource], [gl.FRAGMENT_SHADER,fragmentSource]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

function latchStrength(age) {
  if (!(age >= 0 && age < .54)) return 0;
  const glint = (age - .032) / .027;
  return (1 - age / .54) ** 2 * (.76 + .24 * Math.exp(-glint * glint));
}

function glPainter(gl, getCable) {
  const program = makeProgram(gl);
  const vertex = gl.getAttribLocation(program,'a_vertex');
  const u = Object.fromEntries(['screen','camera','quad','kind','time','wire','port','node','flash','anchorEnd','latch'].map(name=>[name,gl.getUniformLocation(program,'u_'+name)]));
  const rect = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,rect);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,0, 1,-1,0,0, -1,1,0,0, 1,1,0,0]),gl.STATIC_DRAW);
  const buffers = [];
  const uploaded = [];
  gl.enable(gl.BLEND);
  gl.clearColor(0,0,0,0);

  function bind(buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.vertexAttribPointer(vertex,4,gl.FLOAT,false,0,0);
  }
  function quad(kind,x,y,w,h) {
    bind(rect);
    gl.uniform1i(u.kind,kind);
    gl.uniform4f(u.quad,x,y,w,h);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function drawSocket(point, attached, glow, strength, latch) {
    gl.uniform2f(u.latch,latch,0);
    gl.uniform3f(u.port,attached ? 1 : 0,glow,strength);
    const ray = attached ? 86 : 18;
    quad(1,point.x,point.y,24,ray);
  }

  return {
    draw(scene) {
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.blendFunc(gl.ONE,gl.ONE);
      gl.enableVertexAttribArray(vertex);
      gl.uniform2f(u.screen,scene.width,scene.height);
      gl.uniform3f(u.camera,scene.offsetX,scene.offsetY,scene.scale);
      gl.uniform1f(u.time,scene.time || 0);
      for (const [i,node] of scene.nodes.entries()) {
        const age = node.flashAge ?? -1;
        if ((age < 0 || age > 2.8) && !(node.flash > 0.001)) continue;
        const w = node.width/2, h = node.height/2;
        const face = node.flashSide || (i === 0 ? 'right' : 'left');
        const side = face === 'left' ? 1 : -1;
        gl.uniform4f(u.node,w,h,age,side);
        gl.uniform1f(u.flash,node.flash || 0);
        quad(2,node.x+w,node.y+h,w+20,h+20);
      }
      for (const [i,link] of scene.links.entries()) {
        const progress = Math.min(1,Math.max(0,link.progress ?? 1));
        if (progress === 0) continue;
        const cable = getCable(i,link);
        if (cable.length < .05) continue;
        const pulse = link.pulse ?? -1;
        const latch = latchStrength(link.latchAge);
        if (!buffers[i]) buffers[i] = gl.createBuffer();
        bind(buffers[i]);
        if (uploaded[i] !== cable) {
          gl.bufferData(gl.ARRAY_BUFFER,cable.vertices,gl.DYNAMIC_DRAW);
          uploaded[i] = cable;
        }
        gl.uniform1i(u.kind,0);
        gl.uniform1f(u.anchorEnd,link.anchorEnd ? 1 : 0);
        gl.uniform2f(u.latch,latch,link.latchStart ? 1 : 0);
        gl.uniform4f(u.wire,cable.length,progress,pulse,link.reverse ? -1 : 1);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,cable.vertices.length/4);
        const start = link.anchorEnd ? 1-progress : 0;
        const end = link.anchorEnd ? 1 : progress;
        const heatAt = t => pulse < 0 ? 0 : Math.exp(-Math.abs(pulse-(link.reverse ? 1-t : t))*7);
        const fade = Math.min(1,cable.length*progress/7);
        drawSocket(start === 0 ? link.from : pointAt(cable,start),start === 0 && !link.freeStart,heatAt(start),fade,latch * (link.latchStart ? 1 : .25));
        drawSocket(end === 1 ? link.to : pointAt(cable,end),end === 1 && !link.freeEnd,heatAt(end),fade,latch * (link.latchStart ? .25 : 1));
      }
    },
    destroy() {
      for (const b of buffers) if (b) gl.deleteBuffer(b);
      gl.deleteBuffer(rect);
      gl.deleteProgram(program);
    }
  };
}

const fallbackColors = {
  ray: '#c7d3ff', socket: '#ffffff', socketHalo: '#d1d9ff', rim: '#f68cce', coolRim: '#95a9fa',
  crest: '#ffe1f4', wire: '#393a77', core: '#c1c8fc', halo: '#7688f8', latch: '#e2e8ff',
  latchHalo: '#b1bffa', pulseHalo: '#f060bb', tail: ['#ffdcf7','#f4a6e1','#ba7cb4','#885b94']
};

function fallbackPainter(canvas, getCable) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  function socket(point,attached,latch) {
    const {x,y} = point;
    if (attached) {
      const ray = ctx.createLinearGradient(x,y-52,x,y+52);
      ray.addColorStop(0,'transparent');
      ray.addColorStop(.5,fallbackColors.ray);
      ray.addColorStop(1,'transparent');
      ctx.fillStyle = ray;
      ctx.fillRect(x-.8,y-52,1.6,104);
    }
    if (latch > 0) {
      ctx.save();
      ctx.globalAlpha = latch;
      const radius = attached ? 68 : 16;
      ctx.translate(x,y);
      ctx.scale(1,radius / 11);
      const flare = ctx.createRadialGradient(0,0,0,0,0,11);
      flare.addColorStop(0,'#ffffff');
      flare.addColorStop(.18,fallbackColors.latchHalo);
      flare.addColorStop(1,'transparent');
      ctx.fillStyle = flare;
      ctx.fillRect(-11,-11,22,22);
      ctx.restore();
    }
    const light = ctx.createRadialGradient(x,y,0,x,y,10);
    light.addColorStop(0,fallbackColors.socket);
    light.addColorStop(.24,fallbackColors.socketHalo);
    light.addColorStop(1,'transparent');
    ctx.fillStyle = light;
    ctx.fillRect(x-10,y-10,20,20);
  }

  function strokePortion(cable,start,end,color,width,blur) {
    if (end <= start) return;
    const first = pointAt(cable,start), last = pointAt(cable,end);
    ctx.beginPath();
    ctx.moveTo(first.x,first.y);
    for (const p of cable.path) {
      if (p.length <= cable.length*start) continue;
      if (p.length >= cable.length*end) break;
      ctx.lineTo(p.x,p.y);
    }
    ctx.lineTo(last.x,last.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = blur;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  return {
    draw(scene) {
      const sx = canvas.width/scene.width, sy = canvas.height/scene.height;
      ctx.setTransform(sx,0,0,sy,0,0);
      ctx.clearRect(0,0,scene.width,scene.height);
      ctx.translate(scene.offsetX,scene.offsetY);
      ctx.scale(scene.scale,scene.scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const node of scene.nodes) {
        const age = node.flashAge ?? -1;
        const strength = age < 0 ? node.flash || 0 : Math.exp(-age*2.6);
        if (strength < .02) continue;
        ctx.globalAlpha = strength;
        const color = age < .5 ? fallbackColors.rim : fallbackColors.coolRim;
        ctx.strokeStyle = ctx.shadowColor = color;
        if (age >= 0 && age < .4) {
          const x = node.x + (node.flashSide === 'right' ? node.width : 0);
          const y = node.y + node.height/2;
          const radius = Math.max(1,age * (node.width+node.height)*2.6);
          const front = ctx.createRadialGradient(x,y,0,x,y,radius+15);
          front.addColorStop(0,color);
          front.addColorStop(.70,color);
          front.addColorStop(.86,fallbackColors.crest);
          front.addColorStop(1,'transparent');
          ctx.strokeStyle = front;
        }
        ctx.shadowBlur = 7*scene.scale;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(node.x,node.y,node.width,node.height,10);
        else ctx.rect(node.x,node.y,node.width,node.height);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const [i,link] of scene.links.entries()) {
        const progress = Math.min(1,Math.max(0,link.progress ?? 1));
        if (!progress) continue;
        const start = link.anchorEnd ? 1-progress : 0;
        const end = link.anchorEnd ? 1 : progress;
        const cable = getCable(i,link);
        ctx.shadowColor = fallbackColors.halo;
        strokePortion(cable,start,end,fallbackColors.wire,4,9*scene.scale);
        strokePortion(cable,start,end,fallbackColors.core,1.65,3*scene.scale);
        const latch = latchStrength(link.latchAge);
        if (latch > 0) {
          ctx.globalAlpha = latch;
          ctx.shadowColor = fallbackColors.latchHalo;
          strokePortion(cable,start,end,fallbackColors.latch,2.3,6*scene.scale);
          ctx.globalAlpha = 1;
        }
        if (link.pulse != null && link.pulse >= 0) {
          const t = link.pulse;
          ctx.shadowColor = fallbackColors.pulseHalo;
          for (let k=3; k>=0; k--) {
            const head = t - .075*k, tail = head - .075;
            const a = link.reverse ? 1-head : tail;
            const b = link.reverse ? 1-tail : head;
            strokePortion(cable,Math.max(start,a),Math.min(end,b),fallbackColors.tail[k],2.9-.35*k,10*scene.scale);
          }
        }
        ctx.shadowBlur = 0;
        socket(pointAt(cable,start),start === 0 && !link.freeStart,latch * (link.latchStart ? 1 : .25));
        socket(pointAt(cable,end),end === 1 && !link.freeEnd,latch * (link.latchStart ? .25 : 1));
      }
    }
  };
}

// All positions are in flow coordinates. Only the camera transform and canvas
// dimensions are in CSS pixels. time and flashAge are in seconds.
export function createWireRenderer(canvas) {
  const getCable = cableCache();
  const gl = canvas.getContext('webgl',{
    alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false
  });
  let gpu = null;
  let fallback = null;
  let target = canvas;
  const initialVisibility = canvas.style.visibility;
  let savedScene = null;
  let disposed = false;

  function enableFallback() {
    if (gl && target === canvas) {
      target = canvas.cloneNode(false);
      target.removeAttribute('id');
      target.setAttribute('aria-hidden','true');
      target.setAttribute('data-wire-fallback','');
      canvas.after(target);
      // Some browsers paint an opaque placeholder into a lost WebGL canvas.
      canvas.style.visibility = 'hidden';
    }
    fallback = fallbackPainter(target,getCable);
  }

  function initialize() {
    if (gl) {
      try {
        gpu = glPainter(gl,getCable);
        if (target !== canvas) target.remove();
        target = canvas;
        canvas.style.visibility = initialVisibility;
        fallback = null;
        return;
      } catch (error) {
        console.warn('Using the 2D connection renderer.',error);
      }
    }
    enableFallback();
  }

  function draw(scene) {
    if (disposed || !scene.width || !scene.height || scene.scale <= 0) return;
    savedScene = scene;
    const dpr = Math.min(2,window.devicePixelRatio || 1);
    const w = Math.max(1,Math.round(scene.width*dpr));
    const h = Math.max(1,Math.round(scene.height*dpr));
    if (target.width !== w) target.width = w;
    if (target.height !== h) target.height = h;
    (gpu || fallback)?.draw(scene);
  }

  function lost(event) {
    event.preventDefault();
    gpu = null;
    enableFallback();
    if (savedScene) draw(savedScene);
  }
  function restored() {
    initialize();
    if (savedScene) draw(savedScene);
  }

  initialize();
  canvas.addEventListener('webglcontextlost',lost);
  canvas.addEventListener('webglcontextrestored',restored);
  return {
    draw,
    destroy() {
      disposed = true;
      canvas.removeEventListener('webglcontextlost',lost);
      canvas.removeEventListener('webglcontextrestored',restored);
      gpu?.destroy();
      if (target !== canvas) target.remove();
      canvas.style.visibility = initialVisibility;
      gpu = null;
      fallback = null;
      savedScene = null;
    }
  };
}
