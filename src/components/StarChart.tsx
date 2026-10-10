// A decorative planisphere for the front door. Not the social graph.

const SIZE = 520
const C = SIZE / 2

const rand = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const next = rand(29)
const STARS = Array.from({ length: 90 }, () => {
  const a = next() * Math.PI * 2
  const r = 18 + next() * 210
  return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r, n: next() }
})

const near = (i: number) => {
  let best = -1
  let bestD = 78
  for (let j = 0; j < STARS.length; j++) {
    if (j === i) continue
    const d = Math.hypot(STARS[i].x - STARS[j].x, STARS[i].y - STARS[j].y)
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

const LINES: [number, number][] = []
for (let i = 0; i < STARS.length; i += 6) {
  const j = near(i)
  if (j >= 0) LINES.push([i, j])
  if (j >= 0) {
    const k = near(j)
    if (k >= 0 && k !== i) LINES.push([j, k])
  }
}

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2
  const inner = C - (i % 6 === 0 ? 28 : 16)
  const outer = C - 8
  return {
    x1: C + Math.cos(a) * inner,
    y1: C + Math.sin(a) * inner,
    x2: C + Math.cos(a) * outer,
    y2: C + Math.sin(a) * outer,
    major: i % 6 === 0,
  }
})

const RINGS = [78, 132, 186, 236]

export const StarChart = () => (
  <svg className="star-chart" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Circular star chart">
    <circle cx={C} cy={C} r={248} />
    {RINGS.map((r) => (
      <circle key={r} cx={C} cy={C} r={r} />
    ))}
    {TICKS.map((t, i) => (
      <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.major ? 1.2 : 0.6} />
    ))}
    {LINES.map(([a, b], i) => (
      <line key={i} x1={STARS[a].x} y1={STARS[a].y} x2={STARS[b].x} y2={STARS[b].y} strokeWidth={0.8} />
    ))}
    {STARS.map((s, i) => (
      <circle key={i} className="star-chart__dot" cx={s.x} cy={s.y} r={s.n > 0.86 ? 2.2 : 1.15} />
    ))}
    <circle cx={C} cy={C} r={3} className="star-chart__dot" />
  </svg>
)
