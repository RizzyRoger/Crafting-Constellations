import { PEN_NAME_HINTS } from '@moderation'
import { createElement, isValidElement, type ElementType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrisisCard } from '../components/CrisisCard'
import { NewChat } from './NewChat'

// Alice starts a private chat. No Firebase in node: each case says who she's connected with, and
// createChat answers when the case lets it
const data = vi.hoisted(() => ({ connections: [] as unknown[], people: [] as unknown[] }))
const calls = vi.hoisted(() => ({ createChat: vi.fn(), navigate: vi.fn(), problemOf: vi.fn() }))
// Where she is by the time createChat answers: still here, unless a case moves her on
const page = vi.hoisted(() => ({ at: '/chats/new' as string | null }))

// A server render can't press anything, so each case seeds NewChat's state in the order it asks
// for it: name, picked, busy, error. What the page last sets each to is kept, to render again with
const seeded = vi.hoisted(() => ({ values: [] as unknown[], at: 0, set: [] as unknown[] }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useState: (initial: unknown) => {
      const at = seeded.at++
      const [value, set] = react.useState(seeded.values[at] ?? initial)
      return [value, (next: unknown) => ((seeded.set[at] = next), set(next))]
    },
  }
})
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => calls.navigate,
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ createChat: calls.createChat, describeError: vi.fn(), problemOf: calls.problemOf }))
vi.mock('../lib/currentPath', () => ({ useCurrentPath: () => () => page.at }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useQueryData: (key: string) => ({ data: key === 'connections|alice' ? data.connections : key === 'people' ? data.people : [], loading: false, error: null }),
}))

const tie = (other: string, status = 'accepted') => ({ id: ['alice', other].sort().join('_'), uids: ['alice', other].sort(), status })
const person = (id: string, banned = false) => ({ id, penName: id, avatarSeed: id, pigment: 'sepia', pro: false, banned })

type El = ReactElement<{ children?: ReactNode; disabled?: boolean; onSubmit?: (e: { preventDefault: () => void }) => void }>

const find = (node: ReactNode, type: ElementType): El | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, type)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return node.type === type ? (node as El) : find(node.props.children, type)
}

const text = (node: ReactNode): string => {
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : ''
}

// The elements the page returns with these picks, read inside a render so its hooks run
const rendered = (picked: string[], { name = 'Tuesday dinners', error = null as unknown } = {}) => {
  seeded.values = [name, picked, undefined, error]
  seeded.at = 0
  let tree = null as ReactNode
  const Probe = () => {
    tree = NewChat()
    return null
  }
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/chats/new'] }, createElement(Probe)))
  return tree
}

const start = (tree: ReactNode) => find(tree, 'form')!.props.onSubmit!({ preventDefault: () => {} })
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
// The error the page last set, the fourth state it asks for
const lastError = () => seeded.set[3]

// createChat's answer comes once the case says so
const answerLater = () => {
  let answer!: (value: { id: string }) => void
  calls.createChat.mockReturnValue(new Promise((resolve) => (answer = resolve)))
  return async (id: string) => {
    answer({ id })
    await settled()
  }
}

beforeEach(() => {
  calls.createChat.mockReset().mockResolvedValue({ id: 'c9' })
  calls.navigate.mockReset()
  calls.problemOf.mockReset()
  seeded.set = []
  page.at = '/chats/new'
  data.connections = [tie('bob'), tie('carol')]
  data.people = [person('alice'), person('bob'), person('carol')]
})

// Someone picked can drop off the list before Start chat: their box goes with them, so nothing is
// left to untick, and asking for them anyway refused the whole chat (or, banned, let them in)
describe('a picked person who drops off the list', () => {
  const ways: [string, () => void][] = [
    ['disconnected', () => (data.connections = [tie('carol')])],
    ['blocked Alice', () => (data.connections = [tie('bob', 'blocked'), tie('carol')])],
    ['been banned', () => (data.people = [person('alice'), person('bob', true), person('carol')])],
  ]

  it.each(ways)('isn’t counted once they’ve %s', (_, drop) => {
    drop()
    expect(text(find(rendered(['bob', 'carol']), 'legend'))).toBe('People (1 of up to 19)')
  })

  it.each(ways)('isn’t asked into the chat once they’ve %s', (_, drop) => {
    drop()
    start(rendered(['bob', 'carol']))
    expect(calls.createChat).toHaveBeenCalledWith({ name: 'Tuesday dinners', uids: ['carol'] })
  })

  it('leaves Start chat waiting once everyone picked has gone', () => {
    data.connections = [tie('carol')]
    expect(find(rendered(['bob']), 'button')?.props.disabled).toBe(true)
  })

  it('frees their place under the cap, so someone else can be picked', () => {
    // 19 picked, the cap, and then the first of them drops off
    const others = Array.from({ length: 19 }, (_, i) => `p${String(i).padStart(2, '0')}`)
    data.connections = [...others.slice(1), 'zed'].map((id) => tie(id))
    data.people = [...others, 'zed'].map((id) => person(id))
    const boxes = (node: ReactNode): El[] =>
      Array.isArray(node) ? node.flatMap(boxes) : isValidElement<{ children?: ReactNode }>(node) ? (node.type === 'input' ? [node as El] : boxes(node.props.children)) : []
    const unpicked = boxes(find(rendered(others), 'fieldset')!.props.children).at(-1)
    expect(unpicked?.props.disabled).toBe(false)
  })
})

// createChat can take a while (a cold function, or the local backend catching up). Someone who
// moves on meanwhile was pulled off the page they'd chosen, along with anything typed there
describe('once the chat is made', () => {
  it('opens it, if she’s still here', async () => {
    const answer = answerLater()
    start(rendered(['bob']))
    await answer('c9')
    expect(calls.navigate).toHaveBeenCalledWith('/chats/c9')
  })

  it('leaves her where she went if she moved on while it was being made', async () => {
    const answer = answerLater()
    start(rendered(['bob']))
    page.at = null
    await answer('c9')
    expect(calls.navigate).not.toHaveBeenCalled()
  })
})

// Moderation's own tests write crisis language in ROT13 too, so none of it reads plainly here
const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

// The hint for a name that holds crisis language says there are lines below; there were none, just
// a refusal, both as she typed it and when createChat refused it
describe('a chat name that holds crisis language', () => {
  // A name keeps to 32 characters, but the field takes 40 and crisis language is read in all of it
  it.each([
    ['short', rot13('v jnag gb qvr')],
    ['past 32 characters', rot13('v whfg qbag jnag gb or nyvir nalzber')],
  ])('brings the crisis lines with its hint, %s', (_, name) => {
    const tree = rendered(['bob'], { name })
    expect(text(find(tree, 'span'))).toBe(PEN_NAME_HINTS.crisis)
    expect(find(tree, CrisisCard)).toMatchObject({ props: { audience: 'writer' } })
    expect(find(tree, 'button')?.props.disabled).toBe(true)
  })

  it('brings them when createChat refuses the name for it', async () => {
    calls.createChat.mockRejectedValue(new Error('name'))
    calls.problemOf.mockReturnValue('crisis')
    start(rendered(['bob']))
    await settled()
    const tree = rendered(['bob'], { error: lastError() })
    expect(text(find(tree, 'p'))).toBe(PEN_NAME_HINTS.crisis)
    expect(find(tree, CrisisCard)).toMatchObject({ props: { audience: 'writer' } })
  })

  it('leaves them out for a name refused for anything else', async () => {
    for (const name of ['Admin', `Big ${rot13('ergneq')}`, 'x']) {
      const tree = rendered(['bob'], { name })
      expect(find(tree, 'button')?.props.disabled).toBe(true)
      expect(find(tree, CrisisCard)).toBeNull()
    }
    calls.createChat.mockRejectedValue(new Error('name'))
    calls.problemOf.mockReturnValue('unkind')
    start(rendered(['bob']))
    await settled()
    expect(find(rendered(['bob'], { error: lastError() }), CrisisCard)).toBeNull()
  })
})
