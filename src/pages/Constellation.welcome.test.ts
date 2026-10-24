import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EgoMap } from '../constellation/EgoMap'
import { Constellation } from './Constellation'

// Someone new opens on the Friends view. Other people being friends with each other mustn't hide
// the welcome (its groups to join and the way to the groups chart) behind a chart of one dot

const data = vi.hoisted(() => ({ friendships: [] as unknown[], connections: [] as unknown[] }))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useSearchParams: () => [new URLSearchParams(), () => {}],
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'me', profile: { avatarSeed: 'me', pigment: 'fresco' }, claims: { emailVerified: true } }),
}))
vi.mock('../lib/live', () => {
  const person = (id: string, penName: string) => ({ id, penName, avatarSeed: id, pigment: 'fresco', pro: false, banned: false })
  const people = [person('me', 'Even Tide'), person('heron', 'Quiet Heron'), person('river', 'Slow River'), person('wren', 'Grey Wren')]
  const groups = [{ id: 'g1', name: 'Late-night caregivers', constellationId: 'c1' }]
  return {
    useQueryData: (key: string) => {
      const found: Record<string, unknown[]> = { people, groups, friendships: data.friendships, 'connections|me': data.connections }
      return { data: found[key] ?? [], loading: false, error: null }
    },
  }
})

// What the page returns, read inside a render so its hooks run
const rendered = () => {
  let tree = null as ReactNode
  const Probe = () => {
    tree = Constellation()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return tree
}

const find = (node: ReactNode, match: (element: ReactElement) => boolean): ReactElement | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, match)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return match(node) ? node : find(node.props.children, match)
}
const welcome = () => find(rendered(), (element) => 'onGroups' in (element.props as object))
const chart = () => find(rendered(), (element) => element.type === EgoMap)

beforeEach(() => {
  data.friendships = []
  data.connections = []
})

describe('the Friends view for someone with no one yet', () => {
  it('welcomes them though other people are friends', () => {
    data.friendships = [{ id: 'f1', uids: ['heron', 'river'] }, { id: 'f2', uids: ['river', 'wren'] }]
    expect(welcome()).not.toBeNull()
    expect((welcome()?.props as { groups: { id: string }[] }).groups.map((g) => g.id)).toEqual(['g1'])
    expect(chart()).toBeNull()
  })

  it('draws the chart once they have a friend', () => {
    data.friendships = [{ id: 'f1', uids: ['heron', 'river'] }, { id: 'f2', uids: ['me', 'heron'] }]
    expect(chart()).not.toBeNull()
    expect(welcome()).toBeNull()
  })

  it('draws the chart once there is a request', () => {
    data.friendships = [{ id: 'f1', uids: ['heron', 'river'] }]
    data.connections = [{ id: 'k1', uids: ['wren', 'me'], requester: 'wren', recipient: 'me', status: 'pending' }]
    expect(chart()).not.toBeNull()
    expect(welcome()).toBeNull()
  })
})
