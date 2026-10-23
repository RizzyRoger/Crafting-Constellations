import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Talk } from '../components/Talk'
import { Chat } from './Chat'

// Going from one private chat to another keeps the same Chat mounted. React keeps a
// child's state when its type and key match, so the talk must be keyed on the chat or
// a draft, its @mentions and the old messages carry over to the next one.

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
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
const rendered = (url: string) => {
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

const find = (node: ReactNode, type: unknown): ReactElement<{ path?: string }> | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, type)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode; path?: string }>(node)) return null
  return node.type === type ? node : find(node.props.children, type)
}

describe('moving between private chats', () => {
  it('gives each chat its own talk, so a draft stays in the chat it was written for', () => {
    const first = find(rendered('/chats/c1'), Talk)
    const next = find(rendered('/chats/c2'), Talk)
    expect(first?.props.path).toBe('chats/c1/messages')
    expect(next?.props.path).toBe('chats/c2/messages')
    expect(first?.key).not.toBe(next?.key)
  })
})
