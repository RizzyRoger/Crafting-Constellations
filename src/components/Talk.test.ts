import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Talk } from './Talk'

// A talk that has just opened with its history, heard from the server unless a case says
// only the cache has answered; no Firebase in node
const OLD = {
  id: 'm1',
  path: 'groups/g/messages/m1',
  authorUid: 'sam',
  status: 'published',
  createdAt: null,
  text: 'an old note from last week',
  author: { penName: 'Sam', avatarSeed: 'sam', pigment: 'ochre', pro: false },
}
const live = vi.hoisted(() => ({ synced: true, data: [] as unknown[] }))
// The effects each render asks for; a server render runs none of them
const effects = vi.hoisted(() => [] as { run: () => void; deps?: readonly unknown[] }[])
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useEffect: (run: () => void, deps?: readonly unknown[]) => void effects.push({ run, deps }) }
})
// The real announcer, noting what it is told
const told = vi.hoisted(() => [] as { opening: boolean }[])
vi.mock('./Arrivals', async (importOriginal) => {
  const { Arrivals } = await importOriginal<typeof import('./Arrivals')>()
  return {
    Arrivals: (props: Parameters<typeof Arrivals>[0]) => {
      told.push(props)
      return Arrivals(props)
    },
  }
})
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/live', () => ({
  useLiveContent: () => ({ data: live.data, loading: false, error: null, synced: live.synced }),
}))

const render = (verified: boolean, synced = true, data: unknown[] = [OLD]) => {
  live.synced = synced
  live.data = data
  told.length = 0
  effects.length = 0
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Talk, { path: 'groups/g/messages', me: 'u1', verified })))
}

const note = (n: number, authorUid = 'sam', status = 'published') => ({ ...OLD, id: `m${n}`, path: `groups/g/messages/m${n}`, authorUid, status, text: `note ${n}` })
const notes = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => note(from + i))

// What the scroll to the last line is keyed on when the talk shows these messages
const scrollKey = (data: unknown[]) => {
  render(true, true, data)
  const scroll = effects.filter(({ run }) => String(run).includes('scrollIntoView'))
  expect(scroll).toHaveLength(1)
  return scroll[0].deps
}
// As React decides: an effect runs again when any of its deps isn't the same as last time
const runsAgain = (last?: readonly unknown[], next?: readonly unknown[]) =>
  !last || !next || last.length !== next.length || last.some((dep, i) => !Object.is(dep, next[i]))

describe('Talk', () => {
  it('shows its history in a named region that is not live', () => {
    for (const html of [render(true), render(false)]) {
      const chat = html.match(/<div class="chat"[^>]*>/)?.[0]
      expect(chat).toBe('<div class="chat" role="region" aria-label="Group talk">')
      expect(html).toMatch(/an old note from last week/)
    }
  })

  it('has one live part, its announcer, in place and empty: the history it opened with is not news', () => {
    // Unconfirmed, so no composer, which has a live part of its own
    const html = render(false)
    expect(html.match(/<[^>]*aria-live[^>]*>/g)).toEqual(['<p class="visually-hidden" aria-live="polite">'])
    expect(html).toMatch(/<p class="visually-hidden" aria-live="polite"><\/p>/)
  })

  it('keeps the announcer opening until the server has answered, though the cache already shows rows', () => {
    // The cache can answer with only part of the history, which would read as news
    render(true, false)
    expect(told.map((props) => props.opening)).toEqual([true])
    render(true, true)
    expect(told.map((props) => props.opening)).toEqual([false])
  })
})

// Talk asks for the newest 80; once there are that many, each new one pushes the oldest out
describe('Talk, following the newest message', () => {
  it('brings a new message into view once the window is full, as the oldest leaves', () => {
    expect(runsAgain(scrollKey(notes(1, 80)), scrollKey([...notes(2, 80), note(81, 'bea')]))).toBe(true)
  })

  it('still follows older history filling in under a newest message the cache already had', () => {
    expect(runsAgain(scrollKey([note(80)]), scrollKey(notes(1, 80)))).toBe(true)
  })

  it('stays put when only my message changes, from checking to published', () => {
    expect(runsAgain(scrollKey([...notes(1, 9), note(10, 'u1', 'pending')]), scrollKey([...notes(1, 9), note(10, 'u1')]))).toBe(false)
  })
})
