(() => {
  'use strict';

  const width = 390;
  const height = 446;
  const cropTop = 180;
  const fontFamily = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
  const mint = [139, 239, 245];
  const lilac = [228, 218, 245];

  const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0., 1.); }`;

  const fragmentSource = `
    precision highp float;
    uniform sampler2D artwork;
    uniform float seconds;
    uniform vec2 resolution;
    const vec2 size = vec2(390.,446.);
    const vec2 origin = vec2(195.,215.);

    vec4 sampleAt(vec2 p) {
      vec2 uv = clamp(p / size, 0., 1.);
      return texture2D(artwork, uv);
    }

    float projectRadius(float source, float front, float band, float core) {
      float outer = smoothstep(front-band,front+band,source);
      float shoulder = .135 * exp(-max(0.,source-front)/75.);
      return source * mix(core,1.+shoulder,outer);
    }

    float sourceRadius(float screen, float front, float band, float core) {
      // Invert the displacement so every point stays attached to its neighbors
      // even where the expanding ring stretches a stroke severalfold.
      float lo = 0.;
      float hi = screen / core + 1.;
      for (int i=0;i<12;i++) {
        float mid = .5 * (lo+hi);
        if (projectRadius(mid,front,band,core) < screen) lo = mid;
        else hi = mid;
      }
      return .5 * (lo+hi);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      vec2 p = vec2(uv.x, 1. - uv.y) * size;
      vec2 radial = p - origin;
      float r = length(radial);
      vec2 normal = radial / max(r,.001);
      float radius = max(0., seconds - .028) * 1080.;
      float band = 10. + .045*radius;
      float compression = .70 * smoothstep(.040,.125,seconds)
                              * (1.-smoothstep(.167,.47,seconds));
      float core = 1./(1.+compression);
      float split = 3.7 * smoothstep(.04,.09,seconds) * (1.-smoothstep(.18,.32,seconds));
      float qs = sourceRadius(r,radius,band,core);
      // The colour channels cross the refractive boundary at different radii.
      // Sample a symmetric difference about the wave crest for the dispersion.
      float dispersion = split*(1.-smoothstep(band*.6,band*1.6,abs(qs-radius)));
      vec4 red = sampleAt(origin+normal*(qs-dispersion));
      vec4 green = sampleAt(origin+normal*qs);
      vec4 blue = sampleAt(origin+normal*(qs+dispersion));
      float alpha = max(green.a,max(red.a,blue.a));
      float appear = smoothstep(.023,.084,seconds);
      gl_FragColor = vec4(red.r,green.g,blue.b,alpha) * appear;
    }`;

  function rasterizeReceipt(scale, labels) {
    const texture = document.createElement('canvas');
    texture.width = Math.round(width * scale);
    texture.height = Math.round(height * scale);
    const ctx = texture.getContext('2d');
    ctx.scale(texture.width / width, texture.height / height);
    ctx.translate(0, -cropTop);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9.5;
    ctx.strokeStyle = '#e4daf5';
    ctx.beginPath();
    ctx.moveTo(169, 293);
    ctx.lineTo(187, 311);
    ctx.lineTo(220, 277);
    ctx.stroke();

    function label(text, centerY, font, color, tracking = '0px') {
      ctx.font = font + ' ' + fontFamily;
      ctx.textAlign = 'center';
      ctx.letterSpacing = tracking;
      ctx.fillStyle = color;
      const metrics = ctx.measureText(text);
      const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      ctx.fillText(text, width/2, centerY + (ascent-descent)/2);
    }

    const gradient = ctx.createLinearGradient(101,0,289,0);
    gradient.addColorStop(.04, '#fff');
    gradient.addColorStop(.49, '#f8f8fb');
    gradient.addColorStop(.70, '#c0c2d1');
    gradient.addColorStop(1, '#878d9f');
    label(labels.amount,380,'500 52px',gradient,'-1.6px');
    label(labels.payee,425,'500 14px','#dbdce6');
    label(labels.date,452,'400 14px','#8d8d9e');
    ctx.fillStyle = '#f6f7fb';
    ctx.beginPath();
    ctx.roundRect(152,497,86,42,21);
    ctx.fill();
    label(labels.done,518,'500 16px','#14131e');
    return texture;
  }

  function createLens(canvas, labels) {
    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false
    });
    if (!gl) return null;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const image = rasterizeReceipt(scale, labels);
    canvas.width = image.width;
    canvas.height = image.height;
    const shaders = [];
    const program = gl.createProgram();
    let buffer, texture;
    function dispose() {
      gl.deleteBuffer(buffer || null);
      gl.deleteTexture(texture || null);
      gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
    }
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]
    ]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      dispose();
      return null;
    }
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.uniform2f(gl.getUniformLocation(program,'resolution'),canvas.width,canvas.height);
    const seconds = gl.getUniformLocation(program,'seconds');
    gl.viewport(0,0,canvas.width,canvas.height);
    return {
      draw(time) {
        gl.uniform1f(seconds,time);
        gl.drawArrays(gl.TRIANGLES,0,3);
      },
      dispose
    };
  }

  window.createSwipeReceipt = function createSwipeReceipt(host, onReset, payment) {
    const root = document.createElement('div');
    root.className = 'swipe-receipt';
    root.hidden = true;
    root.innerHTML = `
      <div class="swipe-receipt__content">
        <svg class="swipe-receipt__mark" aria-hidden="true" viewBox="0 0 68 50">
          <path d="M8 24 26 42 59 8"/>
        </svg>
        <p class="swipe-receipt__amount"><span></span></p>
        <p class="swipe-receipt__payee"></p>
        <p class="swipe-receipt__date">2026年11月18日 19:29</p>
        <button type="button" class="swipe-receipt__done">完成</button>
      </div>
      <canvas class="swipe-receipt__lens" hidden aria-hidden="true"></canvas>`;
    host.appendChild(root);
    const content = root.querySelector('.swipe-receipt__content');
    const mark = root.querySelector('svg');
    const done = root.querySelector('button');
    const canvas = root.querySelector('canvas');
    const amount = root.querySelector('.swipe-receipt__amount span');
    const payee = root.querySelector('.swipe-receipt__payee');
    amount.textContent = payment.amount;
    payee.textContent = '已转给' + payment.payee;
    const labels = {
      amount: amount.textContent, payee: payee.textContent,
      date: root.querySelector('.swipe-receipt__date').textContent, done: done.textContent
    };
    let lens = createLens(canvas, labels);
    let lastTime = 0;
    let lastReduced = false;

    function update(seconds, reducedMotion = false) {
      root.hidden = false;
      lastTime = seconds;
      lastReduced = reducedMotion;
      const useLens = lens && !reducedMotion && seconds < .52;
      if (useLens) lens.draw(Math.max(0, seconds));
      canvas.hidden = !useLens;
      content.style.opacity = useLens ? '0' : '1';
      done.disabled = Boolean(useLens);
      const hue = reducedMotion ? 1 : Math.max(0, Math.min(1, (seconds-1.5)/.68));
      const t = hue*hue*(3-2*hue);
      const color = lilac.map((v,i) => Math.round(v+(mint[i]-v)*t)).join(', ');
      mark.style.color = 'rgb(' + color + ')';
    }
    function hide() { root.hidden = true; }
    function contextLost(event) {
      event.preventDefault();
      lens = null;
      if (!root.hidden) update(lastTime,lastReduced);
    }
    function contextRestored() {
      lens = createLens(canvas, labels);
      if (!root.hidden) update(lastTime,lastReduced);
    }
    done.addEventListener('click',onReset);
    canvas.addEventListener('webglcontextlost',contextLost);
    canvas.addEventListener('webglcontextrestored',contextRestored);
    return {
      update,
      hide,
      destroy() {
        done.removeEventListener('click',onReset);
        canvas.removeEventListener('webglcontextlost',contextLost);
        canvas.removeEventListener('webglcontextrestored',contextRestored);
        lens?.dispose();
        root.remove();
      }
    };
  };
})();
