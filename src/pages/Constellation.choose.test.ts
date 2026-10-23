import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ConstellationList } from '../constellation/ConstellationList'
import { EgoMap } from '../constellation/EgoMap'
import { PersonSheet } from '../constellation/PersonSheet'
import { CHOOSE } from '../constellation/sheetReveal'
import { Constellation } from './Constellation'

// Choosing whoever is open already leaves the address as it was, so a choice on the page carries
// CHOOSE: that's what brings the sheet back into view on a phone, where it opens under the chart

const router = vi.hoisted(() => ({
  params: new URLSearchParams(),
  moves: [] as { search: string; state?: unknown }[],
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useSearchParams: () => [
    router.params,
    (next: URLSearchParams, options?: { state?: unknown }) => {
      router.moves.push({ search: next.toString(), state: options?.state })
      router.params = new URLSearchParams(next)
    },
  ],
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
const find = (node: ReactNode, type: unknown): ReactElement | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, type)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return node.type === type ? node : find(node.props.children, type)
}
const props = <P>(type: unknown) => find(rendered(), type)?.props as P | undefined

describe('choosing someone on the constellation', () => {
  it('marks choosing whoever is open already as a choice, so their sheet comes up again', () => {
    router.params = new URLSearchParams('person=heron')
    router.moves = []
    props<{ onSelect: (uid: string) => void }>(EgoMap)?.onSelect('heron')
    router.params = new URLSearchParams('view=list&person=heron')
    props<{ onSelect: (uid: string) => void }>(ConstellationList)?.onSelect('heron')
    expect(router.moves).toEqual([
      { search: 'person=heron', state: CHOOSE },
      { search: 'view=list&person=heron', state: CHOOSE },
    ])
  })

  it('doesn’t mark closing the sheet as a choice', () => {
    router.params = new URLSearchParams('person=heron')
    router.moves = []
    props<{ onClose: () => void }>(PersonSheet)?.onClose()
    expect(router.moves).toEqual([{ search: '', state: undefined }])
  })
})
