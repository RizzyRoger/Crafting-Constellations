/*
 * The Value Study — pigment field (pure, no DOM)
 *
 * Watercolor strokes as a per-pixel pigment-density field: dense at the brush
 * entry, streaked by bristles, breaking into dry flecks and mineral
 * granulation as it dies into paper. Runs in a worker or on the main thread.
 */

// Seeded PRNG + value noise ------------------------------------------------

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const makeNoise = (seed) => {
  const rand = mulberry32(seed)
  const vals = Float32Array.from({ length: 256 }, rand)
  const order = Array.from({ length: 256 }, (_, i) => i)
    .map((i) => [rand(), i])
    .sort((a, b) => a[0] - b[0])
    .map(([, i]) => i)
  const perm = Uint8Array.from([...order, ...order])

  const noise = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const X = xi & 255
    const Y = yi & 255
    const a = vals[perm[perm[X] + Y]]
    const b = vals[perm[perm[X + 1] + Y]]
    const c = vals[perm[perm[X] + Y + 1]]
    const d = vals[perm[perm[X + 1] + Y + 1]]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }

  const fbm = (x, y, octaves = 3) => {
    let sum = 0
    let amp = 0.5
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += noise(x, y) * amp
      norm += amp
      x *= 2.03
      y *= 2.03
      amp *= 0.5
    }
    return sum / norm
  }

  return { noise, fbm }
}

const hash = (x, y) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}

// Color ramp ---------------------------------------------------------------

const hexToRgb = (hex) => {
  const n = parseInt(hex.trim().replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// stops: [[density, '#hex'], ...] in any order; density 0 should be paper
const buildRamp = (stops) => {
  const sorted = [...stops].map(([d, c]) => [d, hexToRgb(c)]).sort((a, b) => a[0] - b[0])
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const d = i / 255
    const hi = sorted.findIndex(([sd]) => sd >= d)
    const [d1, c1] = sorted[Math.max(0, hi === -1 ? sorted.length - 1 : hi)]
    const [d0, c0] = sorted[Math.max(0, (hi === -1 ? sorted.length : hi) - 1)]
    const t = d1 === d0 ? 0 : (d - d0) / (d1 - d0)
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * t
  }
  return lut
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// Stroke geometry ----------------------------------------------------------

const EDGE_SAMPLES = 512

const prepareStroke = (s, w, h, noise, i) => {
  const ax = s.from[0] * w
  const ay = s.from[1] * h
  const dx = s.to[0] * w - ax
  const dy = s.to[1] * h - ay
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const hw = ((s.width ?? 0.4) * Math.min(w, h)) / 2
  const edgeFreq = s.edgeFreq ?? 6
  const edge = (side) =>
    Float32Array.from({ length: EDGE_SAMPLES }, (_, k) =>
      noise.fbm((k / EDGE_SAMPLES) * edgeFreq + i * 17.3, side * 31.7 + i, 4),
    )
  return {
    ax, ay, ux, uy, len, hw,
    nx: -uy,
    ny: ux,
    density: s.density ?? 1,
    falloff: s.falloff ?? 1.4,
    rag: s.rag ?? 0.2,
    comb: s.comb ?? 0.16,
    strand: s.strand ?? 8,
    dry: s.dry ?? 0.6,
    pool: s.pool ?? 0.3,
    roundEnd: s.roundEnd ?? false,
    top: edge(1),
    bottom: edge(2),
    offset: i * 53.1,
  }
}

const strokeDensity = (st, px, py, noise, streaks, unit, bloom) => {
  const rx = px - st.ax
  const ry = py - st.ay
  const along = rx * st.ux + ry * st.uy
  const across = rx * st.nx + ry * st.ny
  const t = along / st.len
  if (t < -0.02 || t > 1.08) return 0

  let q = Math.abs(across) / st.hw
  if (q > 1.7) return 0

  // Rounded brush landing (and optional rounded lift)
  if (along < st.hw) {
    const dq = (st.hw - along) / st.hw
    q = Math.sqrt(q * q + dq * dq)
  } else if (st.roundEnd && along > st.len - st.hw) {
    const dq = (along - (st.len - st.hw)) / st.hw
    q = Math.sqrt(q * q + dq * dq)
  }

  // Bristle field: long strands parallel to the stroke (centered on 0)
  const sn = (noise.fbm(along / (260 * unit) + st.offset, across / (st.strand * unit), 3) - 0.5) * 2

  // Edge: slow wobble from the edge tables, combed by the bristles
  const k = Math.min(EDGE_SAMPLES - 1, Math.max(0, (t * EDGE_SAMPLES) | 0))
  const e = across >= 0 ? st.top[k] : st.bottom[k]
  const taper = 1 - 0.3 * smooth(0.55, 1.08, t)
  const edge = taper * (1 + (e - 0.5) * st.rag * 2) + sn * st.comb * (0.3 + t)
  if (q > edge) return 0

  // Crisp where the loaded brush lands, feathered where it lifts
  const soft = 0.04 + 0.2 * t
  const body = 1 - smooth(edge - soft, edge, q)

  // Dry brush: as the load runs out, pigment skips the tooth along strands
  const th = st.dry * smooth(0.45, 1.08, t)
  const dryMask = th > 0 ? smooth(th - 0.22, th + 0.08, 0.55 + sn * 0.6) : 1

  const streakMod = 1 + streaks * sn * (0.45 + 0.55 * t)
  const base = st.density * Math.pow(clamp01(1 - t / 1.06), st.falloff)
  const pool = t < 0.14 ? st.pool * Math.pow(1 - t / 0.14, 2) * (0.6 + 0.8 * noise.noise(px / (22 * unit), py / (22 * unit))) : 0
  const rim = 0.08 * smooth(edge - 0.2, edge - 0.03, q) * body

  return clamp01(((base + pool) * streakMod * bloom + rim * base) * body * dryMask)
}

// Field → pixels -----------------------------------------------------------

// Pigment density is low-frequency, so it is computed on a coarser grid and
// sampled bilinearly; granulation is per output pixel. `unit` keeps strand,
// bloom and grain sizes physical across device pixel ratios (1 = 1.5x render).
const densityField = (w, h, ds, strokes, noise, streaks, unit) => {
  const fw = Math.max(2, Math.ceil(w * ds))
  const fh = Math.max(2, Math.ceil(h * ds))
  const field = new Float32Array(fw * fh)
  const margin = Math.max(6, 0.04 * Math.min(w, h))

  for (let fy = 0; fy < fh; fy++) {
    const y = (fy + 0.5) / ds
    const edgeY = smooth(0, margin, y) * smooth(0, margin, h - y)
    for (let fx = 0; fx < fw; fx++) {
      const x = (fx + 0.5) / ds
      // Never a hard canvas cut: pigment thins out before the box edge
      const fade = edgeY * smooth(0, margin, x) * smooth(0, margin, w - x)
      if (fade <= 0) continue
      const bloom = 1 + 0.32 * (noise.fbm(x / (110 * unit), y / (110 * unit), 2) - 0.5)
      let keep = 1
      for (let i = 0; i < strokes.length; i++) {
        const d = strokeDensity(strokes[i], x, y, noise, streaks, unit, bloom)
        if (d > 0) keep *= 1 - d
      }
      field[fy * fw + fx] = (1 - keep) * fade
    }
  }
  return { field, fw, fh }
}

export const renderField = (w, h, opts) => {
  const noise = makeNoise(opts.seed ?? 29)
  const strokes = opts.strokes.map((s, i) => prepareStroke(s, w, h, noise, i))
  const lut = buildRamp(opts.stops)
  const gran = opts.granulation ?? 0.6
  const streaks = opts.streaks ?? 0.5
  const unit = (opts.scale ?? 1.5) / 1.5
  const ds = opts.fieldScale ?? (w * h > 250_000 ? 0.5 : 1)
  const { field, fw, fh } = densityField(w, h, ds, strokes, noise, streaks, unit)
  const out = new Uint8ClampedArray(w * h * 4)
  const gs = 1.3 * unit
  const gl = 3.6 * unit

  for (let y = 0; y < h; y++) {
    const sy = Math.min(fh - 1.001, Math.max(0, (y + 0.5) * ds - 0.5))
    const y0 = sy | 0
    const ty = sy - y0
    for (let x = 0; x < w; x++) {
      const sx = Math.min(fw - 1.001, Math.max(0, (x + 0.5) * ds - 0.5))
      const x0 = sx | 0
      const tx = sx - x0
      const i = y0 * fw + x0
      const top = field[i] + (field[i + 1] - field[i]) * tx
      const bot = field[i + fw] + (field[i + fw + 1] - field[i + fw]) * tx
      const D = top + (bot - top) * ty
      if (D <= 0.004) continue

      // Granulation: pigment settles into the tooth as the wash thins
      const g1 = noise.noise(x / gs + 400, y / gs)
      const g2 = noise.noise(x / gl + 900, y / gl)
      const hsh = hash(x, y)
      const g = g1 * 0.38 + g2 * 0.5 + hsh * 0.12 - 0.5
      const amp = gran * 2.6 * D * (1 - D) * (0.6 + 0.8 * (1 - D))
      let d2 = D * (1 + amp * g * 1.4)
      if (hsh > 0.992 && D > 0.05 && D < 0.6) d2 += 0.12 * (1 - D)
      d2 = clamp01(d2)

      const li = ((d2 * 255) | 0) * 3
      const o = (y * w + x) * 4
      out[o] = lut[li]
      out[o + 1] = lut[li + 1]
      out[o + 2] = lut[li + 2]
      out[o + 3] = Math.min(255, d2 * 255 * 10)
    }
  }
  return out
}
