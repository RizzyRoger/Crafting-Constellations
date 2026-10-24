import { describe, expect, it } from 'vitest'
import { egoCircle, layoutEgo } from './egoLayout'

const input = {
  width: 800,
  height: 600,
  me: 'me',
  sharedGroups: { me: 3, a: 2, b: 1, c: 0 },
  friendships: [
    { id: 'me-a', uids: ['me', 'a'] as [string, string] },
    { id: 'me-b', uids: ['b', 'me'] as [string, string] },
    { id: 'a-c', uids: ['a', 'c'] as [string, string] },
    { id: 'c-d', uids: ['c', 'd'] as [string, string] },
  ],
  pending: [],
}

describe('ego layout', () => {
  const layout = layoutEgo(input)

  it('puts you at the center', () => {
    const me = layout.nodes.find((n) => n.uid === 'me')!
    expect(me.x).toBe(400)
    expect(me.y).toBe(300)
    expect(me.role).toBe('me')
  })

  it('draws friends and a friend’s friend, not the hop after that', () => {
    expect(layout.nodes.map((n) => n.uid).sort()).toEqual(['a', 'b', 'c', 'me'])
  })

  it('places a friend’s friend one step further out', () => {
    const extended = layout.nodes.find((n) => n.uid === 'c')!
    expect(extended.role).toBe('extended')
  })

  it('draws the friend’s own tie and stops there', () => {
    const ids = layout.edges.map((e) => e.id)
    expect(ids).toContain('a-c')
    expect(ids).toContain('me-a')
    expect(ids).not.toContain('c-d')
  })

  it('sizes dots from shared groups', () => {
    const a = layout.nodes.find((n) => n.uid === 'a')!
    const b = layout.nodes.find((n) => n.uid === 'b')!
    expect(a.r).toBeGreaterThan(b.r)
  })

  it('is deterministic', () => {
    expect(layoutEgo(input)).toEqual(layout)
  })
})

describe('who sits around you', () => {
  const tie = (id: string, a: string, b: string) => ({ id, uids: [a, b] as [string, string] })

  it('names a friend’s friend with every friend of yours they’re tied to, the one they’re drawn beside first', () => {
    const circle = egoCircle({ me: 'me', friendships: [tie('me-b', 'me', 'b'), tie('me-a', 'me', 'a'), tie('b-c', 'b', 'c'), tie('c-a', 'c', 'a')], pending: [] })
    expect([...circle.friends].sort()).toEqual(['a', 'b'])
    expect(circle.through.get('c')).toEqual(['b', 'a'])
  })

  it('keeps requests on the first ring, and blocked people nowhere', () => {
    const circle = egoCircle({
      me: 'me',
      friendships: [tie('me-a', 'me', 'a'), tie('a-p', 'a', 'p'), tie('a-x', 'a', 'x'), tie('me-x', 'me', 'x')],
      pending: [tie('me-p', 'p', 'me')],
      blocked: ['x'],
    })
    expect([...circle.friends]).toEqual(['a'])
    expect([...circle.pending]).toEqual(['p'])
    expect([...circle.through.keys()]).toEqual([])
  })
})
