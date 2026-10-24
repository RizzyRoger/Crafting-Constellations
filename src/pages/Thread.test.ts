import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Thread } from './Thread'

// Private notes that have just opened with their history, heard from the server unless a
// case says only the cache has answered; no Firebase in node
const OLD = { id: 'm1', path: 'dms/a_b/messages/m1', authorUid: 'b', status: 'published', createdAt: null, text: 'an old note from last week' }
const connection = vi.hoisted(() => ({ status: 'accepted' }))
const live = vi.hoisted(() => ({ synced: true, data: [] as unknown[] }))
// The effects each render asks for; a server render runs none of them
const effects = vi.hoisted(() => [] as { run: () => void; deps?: readonly unknown[] }[])
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useEffect: (run: () => void, deps?: readonly unknown[]) => void effects.push({ run, deps }) }
})
// The real announcer, noting what it is told
const told = vi.hoisted(() => [] as { opening: boolean }[])
vi.mock('../components/Arrivals', async (importOriginal) => {
  const { Arrivals } = await importOriginal<typeof import('../components/Arrivals')>()
  return {
    Arrivals: (props: Parameters<typeof Arrivals>[0]) => {
      told.push(props)
      return Arrivals(props)
    },
  }
})
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ profile: null }),
  useMe: () => ({ uid: 'a', claims: { emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useDocData: () => ({ data: { id: 'b', penName: 'Bea', avatarSeed: 'b', pigment: 'ochre', pro: false }, loading: false, error: null, pending: false }),
  useQueryData: () => ({ data: [{ id: 'a_b', uids: ['a', 'b'], status: connection.status }], loading: false, error: null }),
  useLiveContent: () => ({ data: live.data, loading: false, error: null, synced: live.synced }),
}))

const render = (status: string, synced = true, data: unknown[] = [OLD]) => {
  connection.status = status
  live.synced = synced
  live.data = data
  told.length = 0
  effects.length = 0
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/messages/a_b'] },
      createElement(Routes, null, createElement(Route, { path: '/messages/:pairId', element: createElement(Thread) })),
    ),
  )
}

describe('Thread', () => {
  it('shows its history in a named region that is not live', () => {
    for (const html of [render('accepted'), render('pending')]) {
      const chat = html.match(/<div class="chat"[^>]*>/)?.[0]
      expect(chat).toBe('<div class="chat" role="region" aria-label="Conversation">')
      expect(html).toMatch(/an old note from last week/)
    }
  })

  it('has one live part, its announcer, in place and empty: the history it opened with is not news', () => {
    // Not connected yet, so no composer, which has a live part of its own
    const html = render('pending')
    expect(html.match(/<[^>]*aria-live[^>]*>/g)).toEqual(['<p class="visually-hidden" aria-live="polite">'])
    expect(html).toMatch(/<p class="visually-hidden" aria-live="polite"><\/p>/)
  })

  it('keeps the announcer opening until the server has answered, though the cache already shows notes', () => {
    // The cache can answer with only part of the history, which would read as news
    render('accepted', false)
    expect(told.map((props) => props.opening)).toEqual([true])
    render('accepted', true)
    expect(told.map((props) => props.opening)).toEqual([false])
  })
})

const note = (n: number, authorUid = 'b', status = 'published') => ({ ...OLD, id: `m${n}`, path: `dms/a_b/messages/m${n}`, authorUid, status, text: `note ${n}` })
const notes = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => note(from + i))

// What the scroll to the last line is keyed on when the thread shows these notes
const scrollKey = (data: unknown[]) => {
  render('accepted', true, data)
  const scroll = effects.filter(({ run }) => String(run).includes('scrollIntoView'))
  expect(scroll).toHaveLength(1)
  return scroll[0].deps
}
// As React decides: an effect runs again when any of its deps isn't the same as last time
const runsAgain = (last?: readonly unknown[], next?: readonly unknown[]) =>
  !last || !next || last.length !== next.length || last.some((dep, i) => !Object.is(dep, next[i]))

// The thread asks for the newest 200; once there are that many, each new one pushes the oldest out
describe('Thread, following the newest note', () => {
  it('brings a new note into view once the window is full, as the oldest leaves', () => {
    expect(runsAgain(scrollKey(notes(1, 200)), scrollKey([...notes(2, 200), note(201)]))).toBe(true)
  })

  it('still follows older history filling in under a newest note the cache already had', () => {
    expect(runsAgain(scrollKey([note(200)]), scrollKey(notes(1, 200)))).toBe(true)
  })

  it('stays put when only my note changes, from checking to published', () => {
    expect(runsAgain(scrollKey([...notes(1, 9), note(10, 'a', 'pending')]), scrollKey([...notes(1, 9), note(10, 'a')]))).toBe(false)
  })
})
