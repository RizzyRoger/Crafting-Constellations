import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Quiet } from '../components/Quiet'
import { Talk } from '../components/Talk'
import { Chat } from './Chat'

// Going from one private chat to another keeps the same Chat mounted. React keeps a
// child's state when its type and key match, so the talk must be keyed on the chat or
// a draft, its @mentions and the old messages carry over to the next one.

const calls = vi.hoisted(() => ({ leaveChat: vi.fn(), navigate: vi.fn() }))
// Where Alice is by the time leaving goes through: on the chat still, unless a case moves her on
const page = vi.hoisted(() => ({ at: '/chats/c1' as string | null }))

// A server render can't press anything, so a case can seed Chat's state in the order it asks for
// it (leaving, error); unseeded, it starts as Chat starts it
const seeded = vi.hoisted(() => ({ values: [] as unknown[], at: 0 }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useState: (initial: unknown) => react.useState(seeded.values[seeded.at++] ?? initial) }
})
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => calls.navigate,
}))
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../lib/social', () => ({ leaveChat: calls.leaveChat }))
vi.mock('../lib/currentPath', () => ({ useCurrentPath: () => () => page.at }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useDocData: () => ({ data: null, loading: false, error: null, pending: false }),
  useQueryData: (key: string | null) => ({
    data:
      key === 'chats|alice'
        ? [
            { id: 'c1', name: 'Tuesday soup', uids: ['alice', 'bob'] },
            { id: 'c2', name: 'Family', uids: ['alice', 'carl'] },
          ]
        : [],
    loading: false,
    error: null,
  }),
  useLiveContent: () => ({ data: [], loading: false, error: null }),
}))

// The elements Chat returns at this address, read inside a render so its hooks run
const rendered = (url: string, state: unknown[] = []) => {
  seeded.values = state
  seeded.at = 0
  let tree = null as ReactNode
  const Probe = () => {
    tree = Chat()
    return null
  }
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path: '/chats/:chatId', element: createElement(Probe) }))),
  )
  return tree
}

type El = ReactElement<{ children?: ReactNode; path?: string; onClick?: () => void }>

const find = (node: ReactNode, is: (el: El) => boolean): El | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, is)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return is(node as El) ? (node as El) : find(node.props.children, is)
}

const ofType = (type: unknown) => (el: El) => el.type === type

beforeEach(() => {
  calls.leaveChat.mockReset().mockResolvedValue(undefined)
  calls.navigate.mockReset()
  page.at = '/chats/c1'
})

describe('moving between private chats', () => {
  it('gives each chat its own talk, so a draft stays in the chat it was written for', () => {
    const first = find(rendered('/chats/c1'), ofType(Talk))
    const next = find(rendered('/chats/c2'), ofType(Talk))
    expect(first?.props.path).toBe('chats/c1/messages')
    expect(next?.props.path).toBe('chats/c2/messages')
    expect(first?.key).not.toBe(next?.key)
  })

  it('opens another chat chosen while leaving one as itself, not as the one being left', () => {
    expect(find(rendered('/chats/c1', ['c1']), ofType(Quiet))?.props.children).toBe('Leaving the chat…')
    expect(find(rendered('/chats/c2', ['c1']), ofType(Talk))?.props.path).toBe('chats/c2/messages')
  })
})

// Leaving waits for the server, so offline it waits until the connection is back, minutes later
// perhaps. Going on to Messages then pulled Alice off whatever page she'd gone to meanwhile
describe('once leaving goes through', () => {
  const leave = async (moveTo?: string | null) => {
    let done!: () => void
    calls.leaveChat.mockReturnValue(new Promise<void>((resolve) => (done = resolve)))
    find(rendered('/chats/c1'), (el) => el.type === 'button' && el.props.children === 'Leave chat')!.props.onClick!()
    await vi.waitFor(() => expect(calls.leaveChat).toHaveBeenCalledWith('c1', 'alice'))
    if (moveTo !== undefined) page.at = moveTo
    done()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('goes on to Messages, if she’s still on the chat', async () => {
    await leave()
    expect(calls.navigate).toHaveBeenCalledWith('/messages')
  })

  it('leaves her on the page she went to meanwhile', async () => {
    await leave(null)
    expect(calls.navigate).not.toHaveBeenCalled()
  })

  it('leaves her on another chat she opened meanwhile', async () => {
    await leave('/chats/c2')
    expect(calls.navigate).not.toHaveBeenCalled()
  })
})
