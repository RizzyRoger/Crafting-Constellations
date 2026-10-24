import { seedFrom } from '../wash/field'

// A pencil star chart: each constellation is a region of the sheet, each
// group a circle inside it, and each person sits inside one "home" group.
// Other memberships are drawn as faint ties. Deterministic for a given input,
// so the chart doesn't jump between visits.

export interface LayoutInput {
  width: number
  constellations: { id: string; name: string }[]
  groups: { id: string; name: string; constellationId: string }[]
  memberships: { groupId: string; uid: string }[]
  people: string[]
}

export interface PlacedPerson {
  uid: string
  x: number
  y: number
  // Star width: NODE, or less in a group too full for the chart's width
  size: number
  home: string
  groupIds: string[]
}

export interface PlacedGroup {
  id: string
  name: string
  x: number
  y: number
  r: number
  // Where the label sits, so neighbouring labels don't collide
  label: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }
}

export interface PlacedRegion {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface Layout {
  width: number
  height: number
  regions: PlacedRegion[]
  groups: PlacedGroup[]
  people: PlacedPerson[]
  loose: string[]
}

// A star's width on the chart
export const NODE = 28

const MARGIN = 24
const LABEL = 46
// Between neighbouring circles, room for a group's name
const GAP = 34
// Around a region's circles, room for their names
const PAD = 22
// How far stars sit inside their circle's edge
const INSET = 15
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// How wide to draw a star and how far its tap circle reaches; yours is drawn larger.
// Both shrink with a crowded group's spacing, so no tap circle covers a neighbour's centre
export const starDisc = (size: number, isMe: boolean) => {
  const k = size / NODE
  const drawn = (isMe ? NODE + 10 : NODE) * k
  return { size: drawn, hit: drawn / 2 + 6 * k }
}

// Home group: the least crowded of a person's groups, decided in a stable order
const assignHomes = (people: string[], groupsOf: Map<string, string[]>) => {
  const load = new Map<string, number>()
  const homes = new Map<string, string>()
  ;[...people].sort().forEach((uid) => {
    const options = [...(groupsOf.get(uid) ?? [])].sort()
    if (options.length === 0) return
    const home = options.reduce((best, gid) => ((load.get(gid) ?? 0) < (load.get(best) ?? 0) ? gid : best))
    homes.set(uid, home)
    load.set(home, (load.get(home) ?? 0) + 1)
  })
  return homes
}

// Sunflower spiral inside a circle: even spacing for any count
const spiral = (count: number, radius: number, turn: number) =>
  Array.from({ length: count }, (_, i) => {
    const r = count === 1 ? 0 : radius * Math.sqrt((i + 0.5) / count)
    const a = turn + i * GOLDEN
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r }
  })

// Gap between a spiral's closest stars, which are always among its first four
const closest = (count: number, radius: number) => {
  const first = spiral(count, radius, 0).slice(0, 4)
  return Math.min(...first.flatMap((a, i) => first.slice(i + 1).map((b) => Math.hypot(a.dx - b.dx, a.dy - b.dy))))
}

// Radius a circle needs so its stars sit a full star apart, each centre clear of its neighbours' tap circles
const roomFor = (count: number) => (count < 2 ? 0 : INSET + NODE / closest(count, 1))

// Circles sized by residents, then scaled so the ring fits the region, but never
// smaller than their stars need. A ring that is then too wide stacks into a
// column, and a circle whose stars need more than the region's width is held to
// that width and draws smaller stars.
// Spots are circle centres measured from the middle of the region below its name
const arrange = (counts: number[], w: number, h: number, turn: number) => {
  const n = counts.length
  const needs = counts.map(roomFor)
  const wanted = counts.map((k) => 26 + Math.sqrt(k) * 15)
  const rMax = Math.max(0, ...wanted)
  const ring = n <= 1 ? 0 : (2 * rMax + GAP) / (2 * Math.sin(Math.PI / n))
  const room = Math.min(w, h - LABEL) / 2 - PAD
  const scale = Math.min(1, room / (ring + rMax))
  const wide = w / 2 - PAD
  // A lone star has no neighbour to keep clear of
  const stars = (radii: number[]) =>
    radii.map((r, i) => (counts[i] < 2 || r >= needs[i] ? NODE : closest(counts[i], Math.max(0, r - INSET))))

  const ringRadii = wanted.map((r, i) => Math.max(r * scale, needs[i]))
  const spread = n <= 1 ? 0 : (2 * Math.max(...ringRadii) + GAP * scale) / (2 * Math.sin(Math.PI / n))
  const ringSpots = ringRadii.map((_, i) => turn + (i / n) * Math.PI * 2).map((a) => ({ dx: Math.cos(a) * spread, dy: Math.sin(a) * spread }))
  // How far the ring's circles reach from the middle, across or down
  const extent = (axis: 'dx' | 'dy') => Math.max(0, ...ringSpots.map((s, i) => Math.abs(s[axis]) + ringRadii[i]))
  // The scaled ring fits by construction; only one pushed wider by its stars needs checking
  const pushed = ringRadii.some((r, i) => r > wanted[i] * scale)
  if (!pushed || extent('dx') <= wide) {
    return { radii: ringRadii, spots: ringSpots, stars: stars(ringRadii), stacked: false, height: LABEL + 2 * (extent('dy') + PAD) }
  }

  const radii = ringRadii.map((r) => Math.min(r, wide))
  const length = radii.reduce((sum, r) => sum + 2 * r, 0) + GAP * (n - 1)
  const spots = radii.map((r, i) => ({ dx: 0, dy: radii.slice(0, i).reduce((sum, q) => sum + 2 * q + GAP, 0) + r - length / 2 }))
  return { radii, spots, stars: stars(radii), stacked: true, height: LABEL + 2 * PAD + length }
}

export const layoutConstellation = ({ width, constellations, groups, memberships, people }: LayoutInput): Layout => {
  const cols = Math.max(1, Math.min(width >= 880 ? 3 : width >= 600 ? 2 : 1, constellations.length))
  const rows = Math.max(1, Math.ceil(constellations.length / cols))
  const regionW = (width - MARGIN * 2) / cols
  const regionH = Math.max(320, Math.min(460, regionW * 1.05))

  const known = new Set(people)
  const groupIds = new Set(groups.map((g) => g.id))
  const groupsOf = new Map<string, string[]>()
  memberships
    .filter((m) => groupIds.has(m.groupId) && known.has(m.uid))
    .forEach((m) => groupsOf.set(m.uid, [...new Set([...(groupsOf.get(m.uid) ?? []), m.groupId])]))

  const homes = assignHomes(people, groupsOf)
  const residents = (gid: string) => [...homes.entries()].filter(([, home]) => home === gid).map(([uid]) => uid).sort()

  const plans = constellations.map((c) => {
    const inRegion = groups.filter((g) => g.constellationId === c.id)
    const turn = -Math.PI / 2 + ((seedFrom(c.id) % 60) - 30) / 100
    return { inRegion, ...arrange(inRegion.map((g) => residents(g.id).length), regionW, regionH, turn) }
  })

  // Each row is as tall as its tallest region needs
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(regionH, ...plans.slice(row * cols, (row + 1) * cols).map((plan) => plan.height)),
  )
  const rowTop = (row: number) => MARGIN + rowHeights.slice(0, row).reduce((sum, h) => sum + h, 0)
  const height = rowTop(rows) + MARGIN

  const regions: PlacedRegion[] = constellations.map((c, i) => ({
    id: c.id,
    name: c.name,
    x: MARGIN + (i % cols) * regionW,
    y: rowTop(Math.floor(i / cols)),
    w: regionW,
    h: rowHeights[Math.floor(i / cols)],
  }))

  const placedGroups: PlacedGroup[] = []
  const placedPeople: PlacedPerson[] = []

  regions.forEach((region, ri) => {
    const { inRegion, radii, spots, stars, stacked } = plans[ri]
    const n = inRegion.length
    const cx = region.x + region.w / 2
    const cy = region.y + LABEL + (region.h - LABEL) / 2

    inRegion.forEach((g, i) => {
      const x = cx + spots[i].dx
      const y = cy + spots[i].dy
      const r = radii[i]
      // Lower circles in a ring carry their label underneath, pushed away from the centre line
      const below = !stacked && n > 1 && y > cy + 1
      const side: PlacedGroup['label']['anchor'] = Math.abs(x - cx) < 1 ? 'middle' : x < cx ? 'end' : 'start'
      const label: PlacedGroup['label'] = below
        ? { x: side === 'middle' ? x : side === 'end' ? x + r * 0.5 : x - r * 0.5, y: y + r + 20, anchor: side }
        : { x, y: y - r - 8, anchor: 'middle' }
      placedGroups.push({ id: g.id, name: g.name, x, y, r, label })

      const who = residents(g.id)
      spiral(who.length, Math.max(0, r - INSET), seedFrom(g.id) % 6).forEach(({ dx, dy }, k) => {
        placedPeople.push({ uid: who[k], x: x + dx, y: y + dy, size: stars[i], home: g.id, groupIds: groupsOf.get(who[k]) ?? [] })
      })
    })
  })

  const loose = people.filter((uid) => !homes.has(uid))
  return { width, height, regions, groups: placedGroups, people: placedPeople, loose }
}
