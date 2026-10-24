import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from './Shell'

// Pen names are stored tidied (straight apostrophes) and lowercased in penNameLower, and the rail's
// Search for user looks them up by prefix. A phone types "O’Neil" with a curly apostrophe.
// No DOM here, so the test calls the rail itself and keeps its state between calls, as it stays
// while mounted: it can type and look at what the rail shows next. No Firebase in node
const rail = vi.hoisted(() => ({ hooks: [] as unknown[], at: 0, calling: false }))

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const hook = (initial: () => unknown) => {
    const at = rail.at++
    if (!(at in rail.hooks)) rail.hooks[at] = initial()
    return at
  }
  const useState = (initial: unknown) => {
    if (!rail.calling) return react.useState(initial)
    const at = hook(() => (typeof initial === 'function' ? initial() : initial))
    const set = (next: unknown) => {
      rail.hooks[at] = typeof next === 'function' ? next(rail.hooks[at]) : next
    }
    return [rail.hooks[at], set]
  }
  const useRef = (initial: unknown) => (rail.calling ? rail.hooks[hook(() => ({ current: initial }))] : react.useRef(initial))
  return { ...react, useState, useRef }
})
vi.mock('../lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('../auth/useSignOut', () => ({ useSignOut: () => async () => undefined }))
vi.mock('./CheckIn', () => ({ CheckIn: () => null, useCheckInDraft: () => ({}) }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'alice' },
    profile: { id: 'alice', penName: 'Alice', avatarSeed: 'alice', pigment: 'ochre', pro: false, banned: false },
    claims: { admin: false, pro: false, banned: false, emailVerified: true },
  }),
}))
// A query is what it asks for; only the search is answered, by prefix as Firestore would
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: () => ({}),
  collectionGroup: () => ({}),
  documentId: () => 'id',
  query: (_ref: unknown, ...parts: unknown[]) => parts,
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  startAt: (from: string) => ({ from }),
  endAt: () => ({}),
}))
vi.mock('../lib/live', () => {
  const oneil = { id: 'oneil', penName: 'O\'Neil', penNameLower: 'o\'neil', avatarSeed: 'oneil', pigment: 'sepia', pro: false, banned: false }
  const answer = (parts: { from?: string }[]) => {
    const from = parts.find((part) => part.from !== undefined)?.from
    return from && oneil.penNameLower.startsWith(from) ? [oneil] : []
  }
  return {
    useQueryData: (key: string | null, build: () => { from?: string }[]) => ({
      data: key?.startsWith('rail-search|') ? answer(build()) : [],
      loading: false,
      error: null,
    }),
    useDocData: () => ({ data: null, loading: false, error: null, pending: false }),
  }
})

type El = ReactElement<{ children?: ReactNode; 'aria-label'?: string; onChange?: (e: { target: { value: string } }) => void }>

const find = (node: ReactNode, test: (el: El) => boolean): El | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, test)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return test(node as El) ? (node as El) : find(node.props.children, test)
}

// The rail as it is now: its markup, and the search box to type in
const show = () => {
  let tree = null as ReactNode
  const Probe = () => {
    rail.at = 0
    rail.calling = true
    try {
      const shell = Shell({ children: null })
      const Rail = find(shell, (el) => typeof el.type === 'function' && el.type.name === 'Rail')!.type as () => ReactNode
      tree = Rail()
    } finally {
      rail.calling = false
    }
    return tree
  }
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Probe)))
  const box = find(tree, (el) => el.type === 'input' && el.props['aria-label'] === 'Search for user')!
  return { html, type: (text: string) => box.props.onChange!({ target: { value: text } }) }
}

beforeEach(() => {
  rail.hooks = []
})

describe('Search for user', () => {
  it('finds O’Neil typed with a phone’s curly apostrophe', () => {
    show().type('O’Neil')
    const { html } = show()
    expect(html).toContain('>O&#x27;Neil</button>')
    expect(html).not.toContain('No one by that name.')
  })

  it('still says when no one goes by the name', () => {
    show().type('Zed')
    expect(show().html).toContain('No one by that name.')
  })
})
