import { describe, expect, it } from 'vitest'
import { canReachOutTo, layoutEgo } from './egoLayout'

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
    expect(me.canReachOut).toBe(false)
  })

  it('draws friends and a friend’s friend, not the hop after that', () => {
    expect(layout.nodes.map((n) => n.uid).sort()).toEqual(['a', 'b', 'c', 'me'])
  })

  it('does not offer a reach-out to a friend’s friend', () => {
    const extended = layout.nodes.find((n) => n.uid === 'c')!
    expect(extended.role).toBe('extended')
    expect(extended.canReachOut).toBe(false)
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

  it('lets you reach out to someone who is not already on the chart', () => {
    expect(canReachOutTo('me', 'c', input.friendships, input.pending)).toBe(false)
    expect(canReachOutTo('me', 'z', input.friendships, input.pending)).toBe(true)
    expect(canReachOutTo('me', 'me', input.friendships, input.pending)).toBe(false)
  })
})
