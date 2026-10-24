import { describe, expect, it } from 'vitest'
import { layoutConstellation, NODE, starDisc, type Layout } from './layout'

const input = {
  width: 900,
  constellations: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  groups: [
    { id: 'g1', name: 'G1', constellationId: 'a' },
    { id: 'g2', name: 'G2', constellationId: 'a' },
    { id: 'g3', name: 'G3', constellationId: 'b' },
  ],
  memberships: [
    { groupId: 'g1', uid: 'p1' },
    { groupId: 'g1', uid: 'p2' },
    { groupId: 'g2', uid: 'p2' },
    { groupId: 'g3', uid: 'p3' },
    { groupId: 'g3', uid: 'p1' },
  ],
  people: ['p1', 'p2', 'p3', 'p4'],
}

describe('constellation layout', () => {
  const layout = layoutConstellation(input)

  it('puts every grouped person inside their home circle', () => {
    layout.people.forEach((p) => {
      const home = layout.groups.find((g) => g.id === p.home)!
      expect(Math.hypot(p.x - home.x, p.y - home.y)).toBeLessThanOrEqual(home.r)
      expect(p.groupIds).toContain(p.home)
    })
  })

  it('keeps people without a group aside', () => {
    expect(layout.loose).toEqual(['p4'])
    expect(layout.people.map((p) => p.uid).sort()).toEqual(['p1', 'p2', 'p3'])
  })

  it('does not overlap circles in the same constellation', () => {
    const [g1, g2] = layout.groups.filter((g) => g.id === 'g1' || g.id === 'g2')
    expect(Math.hypot(g1.x - g2.x, g1.y - g2.y)).toBeGreaterThan(g1.r + g2.r)
  })

  it('is deterministic', () => {
    expect(layoutConstellation(input)).toEqual(layout)
  })

  it('keeps small groups at their usual size', () => {
    expect(layout.height).toBe(layoutConstellation({ ...input, memberships: [] }).height)
    expect(layout.people.every((p) => p.size === NODE)).toBe(true)
  })
})

describe('an empty chart', () => {
  it.each([560, 600, 640, 720, 840, 880])('has a finite height with no constellations at width %i', (width) => {
    const layout = layoutConstellation({ width, constellations: [], groups: [], memberships: [], people: ['p1'] })
    expect(Number.isFinite(layout.height)).toBe(true)
    expect(layout.loose).toEqual(['p1'])
  })
})

// `count` constellations of three groups; the very first group holds `crowd` people
// who belong only to it, the others three each
const crowded = (width: number, crowd: number, count = 1) => {
  const constellations = Array.from({ length: count }, (_, i) => ({ id: `c${i}`, name: `C${i}` }))
  const groups = constellations.flatMap((c) => ['a', 'b', 'c'].map((k) => ({ id: `${c.id}${k}`, name: k, constellationId: c.id })))
  const memberships = groups.flatMap((g, i) =>
    Array.from({ length: i === 0 ? crowd : 3 }, (_, k) => ({ groupId: g.id, uid: `${g.id}-${String(k).padStart(3, '0')}` })),
  )
  return layoutConstellation({ width, constellations, groups, memberships, people: memberships.map((m) => m.uid) })
}

const closestGap = (layout: Layout, home: string) => {
  const stars = layout.people.filter((p) => p.home === home)
  return Math.min(...stars.flatMap((a, i) => stars.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))))
}

// Stars drawn later sit on top, so their tap circles catch taps over earlier ones.
// Your own star has the widest tap circle, so check against that
const buried = (layout: Layout) =>
  layout.people
    .filter((a, i) => layout.people.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < starDisc(b.size, true).hit))
    .map((p) => p.uid)

// Circles stay inside their region below its name, clear of each other, with their stars inside
const expectTidy = (layout: Layout) => {
  layout.regions.forEach((region) => {
    const circles = layout.groups.filter((g) => g.id.startsWith(region.id))
    circles.forEach((g, i) => {
      expect(g.x - g.r).toBeGreaterThanOrEqual(region.x)
      expect(g.x + g.r).toBeLessThanOrEqual(region.x + region.w)
      expect(g.y - g.r).toBeGreaterThanOrEqual(region.y + 46)
      expect(g.y + g.r).toBeLessThanOrEqual(region.y + region.h)
      circles.slice(i + 1).forEach((other) => expect(Math.hypot(g.x - other.x, g.y - other.y)).toBeGreaterThan(g.r + other.r))
    })
  })
  layout.people.forEach((p) => {
    const home = layout.groups.find((g) => g.id === p.home)!
    expect(Math.hypot(p.x - home.x, p.y - home.y)).toBeLessThanOrEqual(home.r)
  })
}

describe('a crowded group', () => {
  it.each([
    [360, 8, 1],
    [360, 20, 1],
    [640, 20, 2],
    [1120, 30, 3],
  ])('keeps stars a full star apart at width %i with %i people', (width, crowd, count) => {
    const layout = crowded(width, crowd, count)
    expect(closestGap(layout, 'c0a')).toBeGreaterThan(NODE - 1e-9)
    expect(layout.people.every((p) => p.size === NODE)).toBe(true)
    expect(buried(layout)).toEqual([])
    expectTidy(layout)
  })

  it('draws smaller stars when the group needs more than the width', () => {
    const layout = crowded(360, 200)
    const size = layout.people.find((p) => p.home === 'c0a')!.size
    expect(size).toBeLessThan(NODE)
    expect(closestGap(layout, 'c0a')).toBeGreaterThan(size - 1e-9)
    expect(buried(layout)).toEqual([])
    expectTidy(layout)
  })

  it('keeps the ring while it fits across, and stacks the circles when it does not', () => {
    const ring = crowded(640, 4, 2).groups.filter((g) => g.id.startsWith('c0'))
    expect(new Set(ring.map((g) => Math.round(g.x))).size).toBe(3)
    const column = crowded(360, 20).groups
    expect(new Set(column.map((g) => Math.round(g.x))).size).toBe(1)
  })

  it('grows its row and starts the next row below it', () => {
    const layout = crowded(640, 40, 4)
    const [a, b, c, d] = layout.regions
    expect(a.h).toBe(b.h)
    expect(a.h).toBeGreaterThan(c.h)
    expect(c.y).toBeGreaterThanOrEqual(a.y + a.h)
    expect(d.y).toBe(c.y)
    expect(layout.height).toBeGreaterThanOrEqual(c.y + c.h)
    expect(buried(layout)).toEqual([])
    expectTidy(layout)
  })
})
