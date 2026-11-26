// Procedural 3D dot-matrix Earth globe lattice for the HSN status orb.
// Replaces finite video-extracted keyframe clips with a continuous ~1,300-point
// Fibonacci sphere sampled against a compact 144x72 equirectangular land bitmask,
// enabling infinite, completely seamless animation and smooth state transitions.
(() => {
  'use strict';

  const MASK_W = 144;
  const MASK_H = 72;
  const DEFAULT_COUNT = 1300;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  // 144x72 1-bit MSB-first Earth landmask aligned to the reference globe orientation.
  const LAND_MASK_B64 =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//////wAAAAAAAAAAAAAAAAf/////AAAAAAAH/gAAAAAAAA/////4AAAAAAB//gAAAAAAAB//9//wAAAAAB///gAAAAAAAA//gP/4AAAAD////4HwAAA//B/////wAAAAP//////+f4D///////wAAB/AP///////////////8HAAAP//////////////////wHwAAf//////////8H/8f//DwHgAAAf/////////wAfwP//DwAAAAYf////////BAAPAf///4AAA4+////////8AAAPA////8AAAYf////////4AAAAAb///+AAAMf////////8AAAAAB///+AAAH/////////4AAAAAD///+AAAP/////////wAAAAAD///4AAAf/////////5gAAAAB///gAAAR/////////zgAAAAA//+AAAABhn///////wAAAAAAf/+AAAA/xAH/////xgAAAAAAf/+AAAA//xj/////wAAAAAAAf/8AAAB/////////4AAAAAAAf8cAAAB/////////4AAAAAAAP8AAAAD/////////4AAAAAAAH4AAAAH/////8///wAAAAAAAB4gAAAH/////4fn/gAAAAAAAA/gAAAP/////wPn+AAAAAAAAAMAAAAP////xwfH8AAAAAAAAAAAIAAP////xgOD4AAAAAAAAAAB+AAH////zAOAAAAAAAAAAAAD/AAD/////AMAgAAAAAAAAAAD/gAA////+AMBwAAAAAAAAAAH/4AAA///wAABgQAAAAAAAAAP/8AAAf//gAAD38AAAAAAAAAP//AAAH//gAAB+cYAAAAAAAAH//gAAD//AAAA+AcAAAAAAAAH//wAAH//AAAAMAPAAAAAAAAH//wAAP//gAAAAADAAAAAAAAD//gAAP//gAAAAAAAAAAAAAAB//gAAP//CAAAAAxAAAAAAAAAf/AAAH//GAAAAH/gAAAAAAAAP/AAAP/+EAAAA//AAAAAAAAAf+AAAP/+EAAAA//gAAAAAAAAf+AAAD/8AAAAB//wAAAAAAAA/8AAABg8AAAAB//4AAAAAAAA/8AAAAAYAAAAAf/4AAAAAAAB/gAAAAAAAAAAAPz4AAAAAAAB/gAAAAAAAAAAAEBwAAAAAAAA/AAAAAAAAAAAAAAAHAAAAAAA4AAAAAAAAAAAAAAACAAAAAAAwAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  function decodeBits(base64) {
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function hash01(n) {
    let x = (n | 0) + 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  // Orthonormal camera-space basis for the tilted Earth spin axis measured from the reference:
  // North pole tilted ~24 deg sideways and ~16 deg forward toward the viewer.
  function buildAxisBasis() {
    const nx = 0.396, ny = 0.874, nz = 0.282;
    const nLen = Math.hypot(nx, ny, nz);
    const n = [nx / nLen, ny / nLen, nz / nLen];
    // u = normalize(cross(n, [1, 0, 0]))
    const ux = 0, uy = n[2], uz = -n[1];
    const uLen = Math.hypot(ux, uy, uz);
    const u = [ux / uLen, uy / uLen, uz / uLen];
    // v = cross(n, u)
    const v = [
      n[1] * u[2] - n[2] * u[1],
      n[2] * u[0] - n[0] * u[2],
      n[0] * u[1] - n[1] * u[0],
    ];
    return { u, v, n };
  }

  const landBytes = decodeBits(LAND_MASK_B64);

  function sampleLand(lat, lon) {
    const u = ((lon % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const col = Math.floor((u / (2 * Math.PI)) * MASK_W) % MASK_W;
    const row = Math.min(MASK_H - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * MASK_H)));
    const bit = row * MASK_W + col;
    return (landBytes[bit >> 3] >> (7 - (bit & 7))) & 1;
  }

  // Returns interleaved Float32Array (7 floats per dot):
  // [x, y, z, land, seedA, seedB, seedC]
  function createVertices(count = DEFAULT_COUNT) {
    const data = new Float32Array(count * 7);
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const lon = (GOLDEN_ANGLE * i) % (2 * Math.PI);
      const lat = Math.asin(Math.max(-1, Math.min(1, y)));
      const k = i * 7;
      data[k] = r * Math.cos(lon);
      data[k + 1] = y;
      data[k + 2] = r * Math.sin(lon);
      data[k + 3] = sampleLand(lat, lon);
      data[k + 4] = hash01(i * 3 + 17);
      data[k + 5] = hash01(i * 3 + 1013);
      data[k + 6] = hash01(i * 3 + 2909);
    }
    return data;
  }

  window.HSNGlobe = {
    DEFAULT_COUNT,
    axisBasis: buildAxisBasis(),
    createVertices,
  };
})();
