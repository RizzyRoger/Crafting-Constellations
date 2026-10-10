import { describe, expect, it } from 'vitest'
import { layoutConstellation } from './layout'

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
})
