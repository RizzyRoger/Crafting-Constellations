import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Admin } from './Admin'

// Approve and Remove take the entry out of the queue whatever came of them, so what the
// moderator is told can't live in the entry: it has to outlast it, even the queue's last one

const state = vi.hoisted(() => ({
  queue: [] as unknown[],
  keys: [] as (string | null)[],
  seeds: [] as { from: unknown; nth: number; to: unknown }[],
  asked: new Map<unknown, number>(),
}))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn(), problemOf: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'mod', refreshClaims: vi.fn() }) }))
vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null) => {
    state.keys.push(key)
    return { data: state.queue, loading: false, error: null }
  },
}))
vi.mock('../components/PageHead', () => ({ PageHead: () => null }))
// A server render can't press anything, so states are seeded: the nth state the page asks for
// that starts as `from` starts as `to` instead
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const useState = (initial: unknown) => {
    const nth = (state.asked.get(initial) ?? 0) + 1
    state.asked.set(initial, nth)
    const seed = state.seeds.find((s) => Object.is(s.from, initial) && s.nth === nth)
    return react.useState(seed ? seed.to : initial)
  }
  return { ...react, useState }
})

const STATUS = /<p class="meta live" role="status">(.*?)<\/p>/

const render = (tab: string, seeds: typeof state.seeds = []) => {
  state.seeds = seeds
  state.asked = new Map()
  state.keys = []
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/admin${tab}`] }, createElement(Admin)))
}

// The queue's note is the first state the page asks for that starts as words
const renderQueue = (said = '') => render('', [{ from: '', nth: 1, to: said }])

const entry = {
  id: 'dms~a_b~messages~m1',
  contentPath: 'dms/a_b/messages/m1',
  kind: 'dm',
  pairId: 'a_b',
  authorUid: 'a',
  authorPenName: 'Bramble',
  snapshot: { text: 'you are such a loser' },
  automod: { categories: ['harassment'], crisis: false, matches: [] },
  priority: 1,
  state: 'open',
  createdAt: null,
}

describe('review queue', () => {
  beforeEach(() => {
    state.queue = []
  })

  it('has its status region in place and empty before anything is decided', () => {
    state.queue = [entry]
    const html = renderQueue()
    expect(html).toMatch(/Bramble/)
    expect(html.match(STATUS)?.[1]).toBe('')
  })

  it('still says what came of a decision once the queue is clear', () => {
    const said = 'Private note · Bramble — Approved, but not delivered: they’re no longer connected, so it stays held.'
    const html = renderQueue(said)
    expect(html).toMatch(/Nothing waiting\. The queue is clear\./)
    expect(html.match(STATUS)?.[1]).toBe(said)
  })

  // A link off the allow-list holds the writing, and its whole address is the matched term. The
  // entry's lines that repeat it carry .admin-entry > (app.css), which lets them break anywhere
  it('puts the title and matched line that repeat a held link directly in the entry', () => {
    const link = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit'
    state.queue = [
      {
        ...entry,
        id: 'groups~g1~posts~p1',
        contentPath: 'groups/g1/posts/p1',
        kind: 'post',
        groupId: 'g1',
        snapshot: { title: 'docs.google.com/document/d/1AbCdEfGh/edit', text: link },
        automod: { categories: ['spam'], crisis: false, matches: [{ category: 'spam', term: link }] },
      },
    ]
    const html = renderQueue()
    // Straight after the entry's head row (which holds no other div), as its own children
    expect(html).toMatch(
      /<li class="stack admin-entry"[^>]*><div class="row"[^>]*>.*?<\/div><p class="post__title">docs\.google\.com\/document\/d\/1AbCdEfGh\/edit<\/p><p class="voice">[^<]*<\/p><p class="meta">matched: “https:\/\/docs\.google\.com\//,
    )
  })
})

// Someone found by pen name, who isn't the moderator looking
const robin = { id: 'robin', penName: 'Robin', avatarSeed: 'robin', pigment: 'ultramarine', pro: false, banned: false }
// In each row: the error, then the role question, then what the change did, all start as null
const ERROR = 1
const ASKING = 2
const SAID = 3

describe('review people', () => {
  beforeEach(() => {
    state.queue = [robin]
  })

  // A phone types "Mary’s" with a curly apostrophe; stored names have a straight one
  it('searches for a name tidied the way stored names are', () => {
    render('?tab=people', [{ from: '', nth: 1, to: '  Mary’s  La' }])
    expect(state.keys).toEqual(["admin-people|mary's la"])
  })

  it('has a status region in place, empty, before any role change, to say what the change did', () => {
    expect(render('?tab=people').match(STATUS)?.[1]).toBe('')
    const done = 'No longer a moderator. A page they already have open can still read the queue for up to an hour.'
    expect(render('?tab=people', [{ from: null, nth: SAID, to: done }]).match(STATUS)?.[1]).toBe(done)
  })

  // Focus goes to the question as it opens (roleFocus), so it has to be able to take it
  it('asks before removing the role, in words that can take focus, in place of the buttons', () => {
    const html = render('?tab=people', [{ from: null, nth: ASKING, to: 'remove' }])
    expect(html).toMatch(/<span[^>]*tabindex="-1"[^>]*>Remove their moderator role\? [^<]*<\/span><button[^>]*>Yes<\/button>/)
    expect(html).not.toMatch(/>Remove moderator</)
  })

  it('says a refusal out loud', () => {
    const refused = 'They’re a moderator. Remove their moderator role first.'
    const html = render('?tab=people', [{ from: null, nth: ERROR, to: refused }])
    expect(html).toContain(`<p class="error" role="alert">${refused}</p>`)
  })
})
