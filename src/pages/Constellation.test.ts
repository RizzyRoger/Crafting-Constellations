import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConstellationList } from '../constellation/ConstellationList'
import { ConstellationMap } from '../constellation/ConstellationMap'
import { EgoMap } from '../constellation/EgoMap'
import { PersonSheet } from '../constellation/PersonSheet'
import { Constellation } from './Constellation'

// The rail's search opens someone by going to /constellation?person=<id>. Choosing someone
// else on a chart has to move the address too: otherwise searching for the first person again
// lands on the same address, nothing changes, and the other person's sheet stays open

const router = vi.hoisted(() => ({
  params: new URLSearchParams(),
  setParams: (() => {}) as (next: URLSearchParams, options?: { replace?: boolean }) => void,
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useSearchParams: () => [router.params, router.setParams],
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'me', profile: { avatarSeed: 'me', pigment: 'fresco' }, claims: { emailVerified: true } }),
}))
// Whether I have a friend and a request yet. With neither, the Friends view is the welcome
const ties = vi.hoisted(() => ({ mine: true }))
vi.mock('../lib/live', () => {
  const person = (id: string, penName: string) => ({ id, penName, avatarSeed: id, pigment: 'fresco', pro: false, banned: false })
  const data: Record<string, unknown[]> = {
    people: [person('me', 'Even Tide'), person('heron', 'Quiet Heron'), person('river', 'Slow River'), person('wren', 'Grey Wren')],
    friendships: [{ id: 'f1', uids: ['me', 'heron'] }],
    'connections|me': [{ id: 'k1', uids: ['wren', 'me'], requester: 'wren', recipient: 'me', status: 'pending' }],
  }
  const alone: Record<string, unknown[]> = { people: data.people }
  return { useQueryData: (key: string) => ({ data: (ties.mine ? data : alone)[key] ?? [], loading: false, error: null }) }
})

// What the page returns at the current address, read inside a render so its hooks run
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
const ofType = (type: unknown) => (element: ReactElement) => element.type === type
const props = <P>(type: unknown) => find(rendered(), ofType(type))?.props as P | undefined
const openSheet = () => props<{ person: { id: string } }>(PersonSheet)?.person.id ?? null

let moves: { search: string; replace?: boolean }[] = []

beforeEach(() => {
  moves = []
  router.setParams = (next, options) => {
    moves.push({ search: next.toString(), replace: options?.replace })
    router.params = new URLSearchParams(next)
  }
})

describe('the person sheet on the constellation', () => {
  it('opens whoever the search chose, even after someone else was chosen on the chart', () => {
    router.params = new URLSearchParams('person=heron')
    expect(openSheet()).toBe('heron')

    props<{ onSelect: (uid: string) => void }>(EgoMap)?.onSelect('river')
    expect(router.params.toString()).toBe('person=river')
    expect(openSheet()).toBe('river')

    // The search goes to ?person=heron again: a new address now, so the sheet follows
    router.params = new URLSearchParams('person=heron')
    expect(openSheet()).toBe('heron')
  })

  it('keeps the address in step from every view, and from See who, without adding history', () => {
    router.params = new URLSearchParams('view=groups')
    props<{ onSelect: (uid: string) => void }>(ConstellationMap)?.onSelect('heron')
    router.params = new URLSearchParams('view=list&person=heron')
    props<{ onSelect: (uid: string) => void }>(ConstellationList)?.onSelect('river')
    const seeWho = find(rendered(), (element) => element.type === 'button' && (element.props as { children?: unknown }).children === 'See who')
    ;(seeWho?.props as { onClick: () => void }).onClick()
    expect(moves).toEqual([
      { search: 'view=groups&person=heron', replace: true },
      { search: 'view=list&person=river', replace: true },
      { search: 'view=list&person=wren', replace: true },
    ])
  })

  it('closes by taking the person out of the address, keeping the view', () => {
    router.params = new URLSearchParams('view=list&person=river')
    props<{ onClose: () => void }>(PersonSheet)?.onClose()
    expect(moves).toEqual([{ search: 'view=list', replace: true }])
    expect(openSheet()).toBeNull()
  })
})

// The welcome's 'See the groups chart' goes with the welcome as the view switches, and focus went
// to the body with nothing said. It goes first to the Groups tab, which is selected as it lands
describe('the way from the welcome to the groups chart', () => {
  beforeEach(() => {
    ties.mine = false
    router.params = new URLSearchParams()
  })
  afterEach(() => {
    ties.mine = true
  })

  const tab = (tree: ReactNode, label: string) =>
    find(tree, (element) => (element.props as { role?: string }).role === 'tab' && (element.props as { children?: unknown }).children === label)

  it.each([
    ['a click, leaving the page where it is', 1, true],
    ['a key, bringing the tab into view', 0, false],
  ])('moves focus to the Groups tab before the welcome goes, on %s', (_, detail, preventScroll) => {
    const order: unknown[] = []
    router.setParams = (next) => {
      order.push(next.toString())
      router.params = new URLSearchParams(next)
    }
    const tree = rendered()
    const welcome = find(tree, (element) => 'onGroups' in (element.props as object))
    expect(welcome).not.toBeNull()

    const groups = (tab(tree, 'Groups')?.props as { ref?: { current: unknown } }).ref
    if (groups) groups.current = { focus: (options: FocusOptions) => order.push({ focus: options }) }
    ;(welcome?.props as { onGroups: (e: { detail: number }) => void }).onGroups({ detail })

    expect(order).toEqual([{ focus: { preventScroll } }, 'view=groups'])
    expect((tab(rendered(), 'Groups')?.props as { 'aria-selected'?: boolean })['aria-selected']).toBe(true)
  })
})
