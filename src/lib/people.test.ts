import { describe, expect, it, vi } from 'vitest'
import { layoutEgo, type EgoTie } from '../constellation/egoLayout'
import { visibleById, waitingOn, withVisible } from './people'
import type { Connection, Profile } from './types'

vi.mock('./firebase', () => ({ db: {} }))

const person = (id: string, banned = false): Profile => ({ id, penName: id.toUpperCase(), avatarSeed: id, pigment: 'ink', pro: false, banned })

const tie = (a: string, b: string): EgoTie => ({ id: [a, b].sort().join('_'), uids: [a, b] })

const request = (requester: string, recipient: string, status: Connection['status'] = 'pending'): Connection => ({
  ...tie(requester, recipient),
  requester,
  recipient,
  status,
})

// b is banned; e never had a profile anyone can see
const people = [person('a'), person('b', true), person('c'), person('d')]
const visible = visibleById(people)

describe('visible people', () => {
  it('leave out the banned', () => {
    expect([...visible.keys()].sort()).toEqual(['a', 'c', 'd'])
  })
})

describe('ties to draw', () => {
  it('drop anyone banned or without a profile, and whoever was only reached through them', () => {
    const friendships = [tie('a', 'b'), tie('b', 'c'), tie('a', 'd'), tie('a', 'e')]
    const shown = withVisible(friendships, visible, 'a')
    expect(shown.map((t) => t.id)).toEqual(['a_d'])

    const layout = layoutEgo({ width: 800, height: 600, me: 'a', friendships: shown, pending: [], sharedGroups: {} })
    expect(layout.nodes.map((n) => n.uid).sort()).toEqual(['a', 'd'])
    expect(layout.edges.map((e) => e.id)).toEqual(['a_d'])
  })

  it('keep ties between two other people only when both can be seen', () => {
    expect(withVisible([tie('c', 'd'), tie('b', 'c')], visible, 'a').map((t) => t.id)).toEqual(['c_d'])
  })
})

describe('requests waiting on me', () => {
  const connections = [
    request('b', 'a'),
    request('c', 'a'),
    request('e', 'a'),
    request('a', 'd'),
    request('d', 'a', 'accepted'),
  ]

  it('come only from people I can see', () => {
    expect(waitingOn(connections, visible, 'a').map((c) => c.requester)).toEqual(['c'])
  })

  it('count none when the only one is from someone banned', () => {
    expect(waitingOn([request('b', 'a')], visible, 'a')).toHaveLength(0)
  })
})
