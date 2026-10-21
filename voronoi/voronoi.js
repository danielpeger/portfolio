// Hyperbolic Voronoi of the unit disk. Four sites orbit inside the circle;
// one swings between the inner and outer rings. Pairs closer than SEPARATION
// are pushed apart so the borders don't whip around when two sites pass.

const SCALE = 80;
const STROKE_CSS_PX = 1.25;
const CANVAS_SIZE = 2 * SCALE + STROKE_CSS_PX;
const HALF = SCALE + STROKE_CSS_PX / 2;

const SEPARATION = 0.18;
const TEMPO = 3;

// MATLAB rng(0) rand sequence, used for the initial angles.
const RAND = [
  0.814723686393179, 0.905791937075619, 0.126986816293506, 0.913375856139019,
  0.63235924622541, 0.09754040499941, 0.278498218867048, 0.546881519204984,
];

const ORBITS = [
  { phase: RAND[0] * Math.PI * 2, radius: 0.22, speed: 0.12, radial: 0.015, f: [0.31, 0.83, 0.19, 0.41] },
  { phase: RAND[2] * Math.PI * 2, radius: 0.5, speed: -0.2, radial: 0.015, f: [0.53, 1.11, 0.23, 0.37] },
  { phase: RAND[4] * Math.PI * 2, radius: 0.55, speed: 0.09, radial: 0.2, f: [0.47, 0.91, 0.08, 0.05] },
  { phase: RAND[6] * Math.PI * 2, radius: 0.36, speed: -0.11, radial: 0.015, f: [0.29, 0.67, 0.17, 0.33] },
];

function orbitPosition(orbit, t) {
  t *= TEMPO;
  const [f0, f1, f2, f3] = orbit.f;
  // The two sine terms add at most 0.3, so the angular speed keeps its sign.
  const a = 0.18;
  const b = 0.12;
  const angle =
    orbit.phase +
    orbit.speed *
      (t +
        (a * (Math.cos(orbit.phase) - Math.cos(f0 * t + orbit.phase))) / f0 +
        (b * (1 - Math.cos(f1 * t))) / f1);
  const radius =
    orbit.radius +
    orbit.radial * Math.sin(f2 * t + 1.3) +
    orbit.radial * 0.55 * Math.sin(f3 * t + orbit.phase * 0.5);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function sitePositions(t) {
  const pol = ORBITS.map((orbit) => {
    const [x, y] = orbitPosition(orbit, t);
    return { r: Math.hypot(x, y), a: Math.atan2(y, x) };
  });

  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < pol.length; i++) {
      for (let j = i + 1; j < pol.length; j++) separate(pol[i], pol[j]);
    }
  }

  return pol.map((p) => {
    const r = Math.min(0.94, Math.max(0.08, p.r));
    return [Math.cos(p.a) * r, Math.sin(p.a) * r];
  });
}

function separate(p, q) {
  const px = Math.cos(p.a) * p.r;
  const py = Math.sin(p.a) * p.r;
  const qx = Math.cos(q.a) * q.r;
  const qy = Math.sin(q.a) * q.r;
  const dx = qx - px;
  const dy = qy - py;
  const dist = Math.hypot(dx, dy);
  if (dist >= SEPARATION || dist < 1e-8) return;
  const push = (SEPARATION - dist) * 0.5;
  const ux = dx / dist;
  const uy = dy / dist;
  p.r = Math.hypot(px - ux * push, py - uy * push);
  p.a = Math.atan2(py - uy * push, px - ux * push);
  q.r = Math.hypot(qx + ux * push, qy + uy * push);
  q.a = Math.atan2(qy + uy * push, qx + ux * push);
}

// scale, strokePx, half, pad, then 4 sites as vec4 (xy used). 80 bytes.
const UNIFORM_FLOATS = 20;

const SHADER = `
struct Uniforms {
  scale: f32,
  stroke_px: f32,
  half: f32,
  pad: f32,
  sites: array<vec4f, 4>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VSOut {
  var clip = vec2f(-1.0, -1.0);
  if (index == 1u) {
    clip = vec2f(3.0, -1.0);
  } else if (index == 2u) {
    clip = vec2f(-1.0, 3.0);
  }
  var out: VSOut;
  out.position = vec4f(clip, 0.0, 1.0);
  out.world = clip * u.half;
  return out;
}

fn cconj(a: vec2f) -> vec2f {
  return vec2f(a.x, -a.y);
}

fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn pseudo_hyperbolic(z: vec2f, a: vec2f) -> f32 {
  let num = z - a;
  let den = vec2f(1.0, 0.0) - cmul(z, cconj(a));
  return length(num) / max(length(den), 1e-5);
}

fn line_coverage(dist_px: f32, stroke_px: f32) -> f32 {
  let half_w = stroke_px * 0.5;
  let aa = 0.75;
  return 1.0 - smoothstep(max(half_w - aa, 0.0), half_w + aa, dist_px);
}

// Euclidean distance to the hyperbolic bisector of a and b. In the Poincaré
// disk that bisector is a circle orthogonal to the unit circle (or a diameter
// when |a| = |b|). |F2-F1|/|∇F| only linearizes one pair, so it kinks where
// three edges meet; distance to the real circles miters cleanly.
fn bisector_dist(z: vec2f, a: vec2f, b: vec2f) -> f32 {
  let a2 = dot(a, a);
  let b2 = dot(b, b);
  let denom = a2 - b2;
  if (abs(denom) < 1e-6) {
    let delta = b - a;
    let nlen = length(delta);
    if (nlen < 1e-8) {
      return 1e5;
    }
    return abs(dot(z, delta / nlen));
  }
  let c = (a * (1.0 - b2) - b * (1.0 - a2)) / denom;
  let rad = sqrt(max(dot(c, c) - 1.0, 0.0));
  return abs(length(z - c) - rad);
}

fn voronoi_dist(z: vec2f, a0: vec2f, a1: vec2f, a2: vec2f, a3: vec2f) -> f32 {
  let d0 = pseudo_hyperbolic(z, a0);
  let d1 = pseudo_hyperbolic(z, a1);
  let d2 = pseudo_hyperbolic(z, a2);
  let d3 = pseudo_hyperbolic(z, a3);
  var nearest = a0;
  var best = d0;
  if (d1 < best) {
    best = d1;
    nearest = a1;
  }
  if (d2 < best) {
    best = d2;
    nearest = a2;
  }
  if (d3 < best) {
    nearest = a3;
  }
  return min(
    min(bisector_dist(z, nearest, a0), bisector_dist(z, nearest, a1)),
    min(bisector_dist(z, nearest, a2), bisector_dist(z, nearest, a3))
  );
}

fn sample_stroke(
  z: vec2f,
  a0: vec2f, a1: vec2f, a2: vec2f, a3: vec2f,
  inv_pix: f32,
  stroke_px: f32,
) -> f32 {
  let r = length(z);
  let cells = voronoi_dist(z, a0, a1, a2, a3);
  let circle = abs(r - 1.0);
  // Clip Voronoi edges to the disk, then union with the unit circle so
  // T-junctions use the same distance field as the Y-vertices.
  let graph = min(circle, max(cells, r - 1.0));
  return line_coverage(graph * inv_pix, stroke_px);
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4f {
  let z = input.world / u.scale;
  let a0 = u.sites[0].xy / u.scale;
  let a1 = u.sites[1].xy / u.scale;
  let a2 = u.sites[2].xy / u.scale;
  let a3 = u.sites[3].xy / u.scale;

  let r = length(z);
  let dx = dpdx(z);
  let dy = dpdy(z);
  let pix = max(0.5 * (length(dx) + length(dy)), 1e-8);

  if (r > 1.0 + (u.stroke_px * 0.5 + 2.0) * pix) {
    discard;
  }

  let inv_pix = 1.0 / pix;
  var stroke = 0.0;
  stroke += sample_stroke(z + (-0.25) * dx + (-0.25) * dy, a0, a1, a2, a3, inv_pix, u.stroke_px);
  stroke += sample_stroke(z + (0.25) * dx + (-0.25) * dy, a0, a1, a2, a3, inv_pix, u.stroke_px);
  stroke += sample_stroke(z + (-0.25) * dx + (0.25) * dy, a0, a1, a2, a3, inv_pix, u.stroke_px);
  stroke += sample_stroke(z + (0.25) * dx + (0.25) * dy, a0, a1, a2, a3, inv_pix, u.stroke_px);
  stroke *= 0.25;
  return vec4f(0.0, 0.0, 0.0, stroke);
}
`;

class VoronoiSketch extends HTMLElement {
  #canvas;
  #device;
  #context;
  #uniformBuffer;
  #uniforms;
  #pipeline;
  #bindGroup;
  #frame = 0;
  #token = 0;

  connectedCallback() {
    this.style.display = "block";
    this.style.width = `${CANVAS_SIZE}px`;
    this.style.height = `${CANVAS_SIZE}px`;
    this.style.overflow = "hidden";

    if (!this.#canvas) {
      this.#canvas = document.createElement("canvas");
      this.#canvas.style.display = "block";
      this.#canvas.style.width = "100%";
      this.#canvas.style.height = "100%";
      this.append(this.#canvas);
    }

    const token = ++this.#token;
    this.#boot(token);
  }

  disconnectedCallback() {
    this.#token++;
    cancelAnimationFrame(this.#frame);
    this.#device?.destroy();
    this.#device = null;
  }

  async #boot(token) {
    const gpu = navigator.gpu;
    if (!gpu) {
      console.warn("voronoi: WebGPU is not available");
      return;
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter || token !== this.#token) return;

    const device = await adapter.requestDevice();
    if (token !== this.#token) {
      device.destroy();
      return;
    }

    const format = gpu.getPreferredCanvasFormat();
    const context = this.#canvas.getContext("webgpu");
    context.configure({ device, format, alphaMode: "premultiplied" });

    const shader = device.createShaderModule({ label: "voronoi", code: SHADER });
    const compiled = await shader.getCompilationInfo();
    const errors = compiled.messages.filter((message) => message.type === "error");
    if (errors.length) {
      for (const message of errors) console.error(message.message);
      device.destroy();
      return;
    }
    if (token !== this.#token) {
      device.destroy();
      return;
    }

    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs" },
      fragment: {
        module: shader,
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    this.#device = device;
    this.#context = context;
    this.#uniformBuffer = uniformBuffer;
    this.#uniforms = new Float32Array(UNIFORM_FLOATS);
    this.#pipeline = pipeline;
    this.#bindGroup = bindGroup;

    let start = 0;
    const frame = (now) => {
      if (token !== this.#token) return;
      if (!start) start = now;
      this.#draw((now - start) / 1000);
      this.#frame = requestAnimationFrame(frame);
    };
    this.#frame = requestAnimationFrame(frame);
  }

  #draw(seconds) {
    const dpr = window.devicePixelRatio || 1;
    const pixels = Math.max(1, Math.round(CANVAS_SIZE * dpr));
    if (this.#canvas.width !== pixels || this.#canvas.height !== pixels) {
      this.#canvas.width = pixels;
      this.#canvas.height = pixels;
    }

    const data = this.#uniforms;
    data[0] = SCALE;
    data[1] = STROKE_CSS_PX * dpr;
    data[2] = HALF;
    const sites = sitePositions(seconds);
    for (let i = 0; i < sites.length; i++) {
      const o = 4 + i * 4;
      data[o] = sites[i][0] * SCALE;
      data[o + 1] = sites[i][1] * SCALE;
    }
    this.#device.queue.writeBuffer(this.#uniformBuffer, 0, data);

    const encoder = this.#device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup);
    pass.draw(3);
    pass.end();
    this.#device.queue.submit([encoder.finish()]);
  }
}

customElements.define("voronoi-sketch", VoronoiSketch);
