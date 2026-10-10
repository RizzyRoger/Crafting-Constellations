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

const MARGIN = 24
const LABEL = 46
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

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

export const layoutConstellation = ({ width, constellations, groups, memberships, people }: LayoutInput): Layout => {
  const cols = width >= 880 ? Math.min(3, Math.max(1, constellations.length)) : width >= 600 ? Math.min(2, constellations.length) : 1
  const rows = Math.max(1, Math.ceil(constellations.length / cols))
  const regionW = (width - MARGIN * 2) / cols
  const regionH = Math.max(320, Math.min(460, regionW * 1.05))
  const height = rows * regionH + MARGIN * 2

  const known = new Set(people)
  const groupIds = new Set(groups.map((g) => g.id))
  const groupsOf = new Map<string, string[]>()
  memberships
    .filter((m) => groupIds.has(m.groupId) && known.has(m.uid))
    .forEach((m) => groupsOf.set(m.uid, [...new Set([...(groupsOf.get(m.uid) ?? []), m.groupId])]))

  const homes = assignHomes(people, groupsOf)
  const residents = (gid: string) => [...homes.entries()].filter(([, home]) => home === gid).map(([uid]) => uid).sort()

  const regions: PlacedRegion[] = constellations.map((c, i) => ({
    id: c.id,
    name: c.name,
    x: MARGIN + (i % cols) * regionW,
    y: MARGIN + Math.floor(i / cols) * regionH,
    w: regionW,
    h: regionH,
  }))

  const placedGroups: PlacedGroup[] = []
  const placedPeople: PlacedPerson[] = []

  regions.forEach((region) => {
    const inRegion = groups.filter((g) => g.constellationId === region.id)
    if (inRegion.length === 0) return
    const n = inRegion.length

    // Circles sized by residents, then scaled so the arrangement fits the region
    const wanted = inRegion.map((g) => 26 + Math.sqrt(residents(g.id).length) * 15)
    const rMax = Math.max(...wanted)
    const ring = n === 1 ? 0 : (2 * rMax + 34) / (2 * Math.sin(Math.PI / n))
    const room = Math.min(region.w, region.h - LABEL) / 2 - 22
    const scale = Math.min(1, room / (ring + rMax))
    const cx = region.x + region.w / 2
    const cy = region.y + LABEL + (region.h - LABEL) / 2
    const turn = -Math.PI / 2 + ((seedFrom(region.id) % 60) - 30) / 100

    inRegion.forEach((g, i) => {
      const a = turn + (i / n) * Math.PI * 2
      const x = cx + Math.cos(a) * ring * scale
      const y = cy + Math.sin(a) * ring * scale
      const r = wanted[i] * scale
      // Lower circles carry their label underneath, pushed away from the centre line
      const below = n > 1 && y > cy + 1
      const side: PlacedGroup['label']['anchor'] = Math.abs(x - cx) < 1 ? 'middle' : x < cx ? 'end' : 'start'
      const label: PlacedGroup['label'] = below
        ? { x: side === 'middle' ? x : side === 'end' ? x + r * 0.5 : x - r * 0.5, y: y + r + 20, anchor: side }
        : { x, y: y - r - 8, anchor: 'middle' }
      placedGroups.push({ id: g.id, name: g.name, x, y, r, label })

      const who = residents(g.id)
      spiral(who.length, Math.max(0, r - 15), seedFrom(g.id) % 6).forEach(({ dx, dy }, k) => {
        placedPeople.push({ uid: who[k], x: x + dx, y: y + dy, home: g.id, groupIds: groupsOf.get(who[k]) ?? [] })
      })
    })
  })

  const loose = people.filter((uid) => !homes.has(uid))
  return { width, height, regions, groups: placedGroups, people: placedPeople, loose }
}
