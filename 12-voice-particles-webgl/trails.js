(() => {
  "use strict";

  const vertexSource = `
    attribute vec2 a_corner;
    attribute vec4 a_flight;
    attribute vec3 a_grain;
    uniform vec2 u_resolution;
    uniform vec2 u_button;
    uniform float u_agent;
    uniform float u_progress;
    uniform float u_opening;
    uniform float u_time;
    varying mediump vec2 v_local;
    varying mediump float v_length;
    varying mediump float v_radius;
    varying mediump float v_alpha;
    varying lowp vec3 v_color;

    // Stay close to the floor until the final climb into the voice control.
    vec2 path(vec2 floorPoint, float t) {
      float lift = t * t * t * t;
      float ripple = sin(6.283 * t + a_grain.x * 15.0) * sin(3.1416 * t);
      return vec2(
        mix(floorPoint.x, u_button.x, t),
        mix(floorPoint.y, u_button.y, lift) + ripple * u_resolution.y * 0.023
      );
    }

    float flightTime(float age) {
      float t = smoothstep(0.0, 1.0, age);
      return mix(t, 1.0 - t, u_opening);
    }

    void main() {
      float age = (u_progress - a_flight.z) / a_flight.w;
      float pitch = u_resolution.x * mix(0.00672, 0.00966, u_agent);
      vec2 floorPoint = vec2(
        (floor(a_flight.x * u_resolution.x / pitch) + 0.5) * pitch,
        u_resolution.y - (floor(a_flight.y * mix(8.0, 16.0, u_agent)) + 0.5) * pitch
      );
      vec2 head = path(floorPoint, flightTime(age));
      vec2 previous = path(floorPoint, flightTime(age - 0.060 - 0.032 * a_grain.z));
      vec2 delta = head - previous;
      float travel = length(delta);
      vec2 axis = travel > 0.001 ? delta / travel : vec2(1.0, 0.0);
      vec2 normal = vec2(-axis.y, axis.x);
      float radius = max(0.65, pitch * mix(0.22, 0.37, a_grain.y));
      float tail = min(travel, u_resolution.x * 0.073);
      float pad = radius + 1.1;
      v_local = vec2(mix(-tail - pad, pad, a_corner.x), a_corner.y * pad);
      vec2 position = head + axis * v_local.x + normal * v_local.y;
      gl_Position = vec4(position / u_resolution * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
      v_length = tail;
      v_radius = radius;
      v_alpha = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.78, 1.0, age));
      v_alpha *= mix(0.68, 0.98, a_grain.y);

      float hueBand = 0.72 + 0.23 * cos(u_time * 0.40 - 2.34);
      float hue = fract(hueBand + 0.82 * (a_flight.x - 0.5) + 0.12 * (a_grain.x - 0.5));
      vec3 hues = clamp(abs(fract(hue + vec3(0., 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
      v_color = mix(vec3(1.), hues, 0.56 + 0.42 * a_grain.z);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    varying mediump vec2 v_local;
    varying mediump float v_length;
    varying mediump float v_radius;
    varying mediump float v_alpha;
    varying lowp vec3 v_color;

    void main() {
      float edge = max(abs(v_local.x), abs(v_local.y)) - v_radius;
      float head = 1.0 - smoothstep(-0.45, 0.65, edge);
      float along = clamp(1.0 + v_local.x / max(v_length, 0.5), 0.0, 1.0);
      float line = (1.0 - smoothstep(v_radius * 0.52, v_radius * 0.80 + 0.45, abs(v_local.y)))
                 * smoothstep(-v_length - 0.2, -v_length + 0.7, v_local.x)
                 * (1.0 - smoothstep(-0.25, 0.5, v_local.x));
      float alpha = v_alpha * max(head, line * (0.14 + 0.29 * along));
      gl_FragColor = vec4(v_color * alpha, alpha);
    }
  `;

  function createProgram(gl) {
    const program = gl.createProgram();
    const shaders = [];
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
      shaders.forEach(shader => gl.deleteShader(shader));
    }
  }

  function createGeometry() {
    // Fixed origins let a pulse leave and settle back onto the square lattice.
    let seed = 82667;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const vertices = [];
    const corners = [[0,-1], [1,-1], [1,1], [0,-1], [1,1], [0,1]];
    for (let i = 0; i < 38; i++) {
      const x = 0.12 + 0.38 * (random() + random());
      const y = Math.pow(random(), 2) * Math.exp(-9 * (x - 0.5) ** 2);
      const delay = 0.02 + 0.21 * random();
      const duration = 0.62 + 0.14 * random();
      const grain = [random(), random(), random()];
      for (const corner of corners) vertices.push(...corner, x, y, delay, duration, ...grain);
    }
    return new Float32Array(vertices);
  }

  window.createVoiceTrails = function createVoiceTrails(gl) {
    const program = createProgram(gl);
    const geometry = createGeometry();
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "a_corner");
    const flight = gl.getAttribLocation(program, "a_flight");
    const grain = gl.getAttribLocation(program, "a_grain");
    const uniform = name => gl.getUniformLocation(program, "u_" + name);
    const resolution = uniform("resolution");
    const button = uniform("button");
    const agent = uniform("agent");
    const progress = uniform("progress");
    const opening = uniform("opening");
    const time = uniform("time");
    return {
      draw(frame) {
        const isOpening = frame.opening >= 0 && frame.opening <= 1;
        const t = isOpening ? frame.opening : frame.closing;
        if (!(t > 0 && t < 1)) return;
        const { width, height } = frame;
        const isAgent = frame.kind === "agent";
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(corner);
        gl.enableVertexAttribArray(flight);
        gl.enableVertexAttribArray(grain);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 36, 0);
        gl.vertexAttribPointer(flight, 4, gl.FLOAT, false, 36, 8);
        gl.vertexAttribPointer(grain, 3, gl.FLOAT, false, 36, 24);
        gl.uniform2f(resolution, width, height);
        gl.uniform2f(button, width * (isAgent ? 0.868 : 0.916), isAgent ? height - width * 171 / 726 : height * 0.70);
        gl.uniform1f(agent, isAgent ? 1 : 0);
        gl.uniform1f(progress, t);
        gl.uniform1f(opening, isOpening ? 1 : 0);
        gl.uniform1f(time, frame.time);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 9);
        gl.disable(gl.BLEND);
        gl.disableVertexAttribArray(corner);
        gl.disableVertexAttribArray(flight);
        gl.disableVertexAttribArray(grain);
      },
      destroy() {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
    };
  };
})();
