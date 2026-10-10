/*
 * The Value Study — granulating wash renderer (DOM side)
 *
 * Asks a worker for the pigment field, then lets the wash enter along the
 * brush path. Decorative only: content never waits on it.
 */

import { renderField } from './wash-field.js'

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

// Workers: the hero goes to one, swatches queue on the least-loaded ---------

const WORKER_COUNT = Math.min(2, navigator.hardwareConcurrency || 1)
const pending = new Map()
let workers = null
let nextId = 0

const startWorkers = () => {
  try {
    return Array.from({ length: WORKER_COUNT }, () => {
      const worker = new Worker(new URL('./wash-worker.js', import.meta.url), { type: 'module' })
      const slot = { worker, load: 0 }
      worker.onmessage = ({ data }) => {
        const job = pending.get(data.id)
        pending.delete(data.id)
        slot.load -= job.load
        job.resolve(data.pixels)
      }
      return slot
    })
  } catch {
    return []
  }
}

const requestField = (w, h, opts) => {
  workers ??= startWorkers()
  if (workers.length === 0) return Promise.resolve(renderField(w, h, opts))
  const slot = workers.reduce((a, b) => (b.load < a.load ? b : a))
  const id = nextId++
  const load = w * h
  slot.load += load
  return new Promise((resolve) => {
    pending.set(id, { resolve, load })
    slot.worker.postMessage({ id, w, h, opts })
  })
}

// Reveal along the brush path ---------------------------------------------

const easeOut = (t) => 1 - Math.pow(1 - t, 3)

const reveal = (ctx, source, w, h, stroke, duration, onDone) => {
  const ax = stroke.from[0] * w
  const ay = stroke.from[1] * h
  const dx = stroke.to[0] * w - ax
  const dy = stroke.to[1] * h - ay
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const proj = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => (x - ax) * ux + (y - ay) * uy)
  const t0 = Math.min(...proj)
  const t1 = Math.max(...proj)
  const start = performance.now()

  const frame = (now) => {
    const p = easeOut(Math.min(1, (now - start) / duration))
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(source, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    const g = ctx.createLinearGradient(ax + ux * t0, ay + uy * t0, ax + ux * t1, ay + uy * t1)
    const front = p * 1.15
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(clamp01(front - 0.15), 'rgba(0,0,0,1)')
    g.addColorStop(clamp01(front), 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    if (p < 1) requestAnimationFrame(frame)
    else onDone?.()
  }
  requestAnimationFrame(frame)
}

// Public -------------------------------------------------------------------

const MAX_PIXELS = 1_700_000

export const paintWash = (el, opts) => {
  const canvas = el.querySelector('canvas') ?? el.appendChild(document.createElement('canvas'))
  canvas.setAttribute('aria-hidden', 'true')
  let lastW = 0
  let lastH = 0
  let version = 0

  const paint = (animate) => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, opts.maxScale ?? 1.5)
    const fit = Math.min(1, Math.sqrt(MAX_PIXELS / (rect.width * rect.height * dpr * dpr)))
    const scale = dpr * fit
    const w = Math.round(rect.width * scale)
    const h = Math.round(rect.height * scale)
    lastW = rect.width
    lastH = rect.height

    const token = ++version
    const { stops, strokes, seed, granulation, streaks, fieldScale } = opts
    requestField(w, h, { stops, strokes, seed, granulation, streaks, fieldScale, scale }).then((pixels) => {
      if (token !== version) return
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      off.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0)

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      el.classList.add('is-painted')

      if (!animate || REDUCED_MOTION) {
        ctx.drawImage(off, 0, 0)
        return
      }
      reveal(ctx, off, w, h, strokes[0], opts.duration ?? 1000)
    })
  }

  paint(opts.animate ?? true)

  let timer = 0
  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    if (Math.abs(width - lastW) < 4 && Math.abs(height - lastH) < 4) return
    clearTimeout(timer)
    timer = setTimeout(() => paint(false), 160)
  }).observe(el)
}

// Presets ------------------------------------------------------------------

const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim()

export const paynesStops = (el = document.documentElement) => [
  [1, '#15181f'],
  [0.86, css(el, '--wash-core')],
  [0.7, css(el, '--wash-entry')],
  [0.56, '#4a525d'],
  [0.46, css(el, '--wash-shoulder')],
  [0.36, css(el, '--wash-mid')],
  [0.26, css(el, '--wash-thin')],
  [0.15, css(el, '--wash-fade')],
  [0.06, css(el, '--wash-ghost')],
  [0, css(el, '--paper-warm')],
]

// A cut swatch bar, painted left-dense → right-paper from its --d/--m/--t vars
export const paintSwatch = (el, i = 0) => {
  const stops = [
    [1, css(el, '--d')],
    [0.55, css(el, '--m')],
    [0.22, css(el, '--t')],
    [0, css(document.documentElement, '--paper')],
  ]
  const loose = el.dataset.loose !== undefined
  paintWash(el, {
    seed: 101 + i * 7,
    stops,
    granulation: Number(el.dataset.gran ?? 0.35),
    streaks: loose ? 0.4 : 0.12,
    animate: false,
    maxScale: 2,
    strokes: [
      {
        from: [0.01, 0.5],
        to: [0.99, 0.5],
        width: loose ? 0.9 : 0.84,
        density: Number(el.dataset.density ?? 1),
        falloff: 0.85,
        rag: loose ? 0.22 : 0.08,
        dry: loose ? 0.55 : 0.12,
        pool: loose ? 0.45 : 0.15,
        edgeFreq: loose ? 14 : 8,
        comb: loose ? 0.14 : 0.025,
        strand: loose ? 7 : 12,
        roundEnd: !loose,
      },
    ],
  })
}

export const paintSwatches = (root = document) =>
  [...root.querySelectorAll('.swatch')].forEach((el, i) => paintSwatch(el, i))
