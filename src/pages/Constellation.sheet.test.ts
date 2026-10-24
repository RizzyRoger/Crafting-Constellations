import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ConstellationMap } from '../constellation/ConstellationMap'
import { PersonSheet } from '../constellation/PersonSheet'
import { Constellation } from './Constellation'

// A sheet opening with the page (a reload, Back) under a groups chart that isn't measured yet was
// brought into view under a 300px placeholder, then pushed far out of sight as the chart grew

const router = vi.hoisted(() => ({ params: new URLSearchParams() }))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useSearchParams: () => [router.params, () => {}],
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'me', profile: { avatarSeed: 'me', pigment: 'fresco' }, claims: { emailVerified: true } }),
}))
vi.mock('../lib/live', () => {
  const person = (id: string, penName: string) => ({ id, penName, avatarSeed: id, pigment: 'fresco', pro: false, banned: false })
  const data: Record<string, unknown[]> = {
    people: [person('me', 'Even Tide'), person('heron', 'Quiet Heron')],
    friendships: [{ id: 'f1', uids: ['me', 'heron'] }],
  }
  return { useQueryData: (key: string) => ({ data: data[key] ?? [], loading: false, error: null }) }
})

// What the page returns at an address, read inside a render so its hooks run. A server render
// runs no effects, so the groups chart is never measured here
const rendered = (search: string) => {
  router.params = new URLSearchParams(search)
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
const ofType = (type: unknown) => (element: ReactElement) => element.type === type

describe('the person sheet opening with the page', () => {
  it('waits for the groups chart to be laid out, which tells the page', () => {
    const tree = rendered('view=groups&person=heron')
    expect(find(tree, ofType(PersonSheet))).toBeNull()
    expect((find(tree, ofType(ConstellationMap))?.props as { onLaidOut?: unknown }).onLaidOut).toBeTypeOf('function')
  })

  it('opens at once over the friends chart and the list', () => {
    expect(find(rendered('person=heron'), ofType(PersonSheet))).not.toBeNull()
    expect(find(rendered('view=list&person=heron'), ofType(PersonSheet))).not.toBeNull()
  })
})

describe('the chart around the sheet', () => {
  it('isn’t left focusable, so a click on its text keeps Tab where the click was', () => {
    for (const search of ['person=heron', 'view=groups', 'view=list']) {
      const chart = find(rendered(search), (element) => (element.props as { className?: string }).className === 'constellation')
      expect(chart).not.toBeNull()
      expect((chart?.props as { tabIndex?: number }).tabIndex).toBeUndefined()
    }
  })
})
