import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Admin } from './Admin'

// Approve and Remove take the entry out of the queue whatever came of them, so what the
// moderator is told can't live in the entry: it has to outlast it, even the queue's last one

const state = vi.hoisted(() => ({
  queue: [] as unknown[],
  // What a listen answers in place of the queue's rows, by its key
  answers: new Map<string, { data?: unknown[]; loading?: boolean; error?: Error | null }>(),
  keys: [] as (string | null)[],
  seeds: [] as { from: unknown; nth: number; to: unknown }[],
  asked: new Map<unknown, number>(),
}))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('../lib/callables', () => ({ describeError: (e: Error) => e.message, problemOf: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'mod', refreshClaims: vi.fn() }) }))
vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null) => {
    state.keys.push(key)
    return { data: state.queue, loading: false, error: null, ...(key ? state.answers.get(key) : undefined) }
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
    state.answers = new Map()
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

  // A ban swaps Ban for Lift ban, and lifting it swaps them back: the region that says what
  // happened can't go with either, or it arrives already holding its words, which isn't heard
  it('keeps its status region once they’re banned, to say what the ban or its lifting did', () => {
    state.queue = [{ ...robin, banned: true }]
    const html = render('?tab=people')
    expect(html).toMatch(/>Lift ban</)
    expect(html.match(STATUS)?.[1]).toBe('')
    const banned = 'Banned. They’re signed out everywhere and can’t sign in.'
    expect(render('?tab=people', [{ from: null, nth: SAID, to: banned }]).match(STATUS)?.[1]).toBe(banned)
  })

  it('says a lifted ban in the same region the Ban row had', () => {
    const lifted = 'Ban lifted. They can sign in again.'
    const html = render('?tab=people', [{ from: null, nth: SAID, to: lifted }])
    expect(html).toMatch(/>Ban</)
    expect(html.match(STATUS)?.[1]).toBe(lifted)
  })
})

const application = {
  id: 'robin',
  uid: 'robin',
  status: 'submitted',
  legalName: 'Robin Ash',
  licenseType: 'LCSW',
  licenseRegion: 'Oregon',
  licenseNumber: '12345',
  files: ['licence.pdf'],
  submittedAt: null,
}
const licensed = { ...robin, id: 'wren', penName: 'Wren', pro: true }
const NONE_WAITING = /No applications waiting\./

describe('review professionals', () => {
  beforeEach(() => {
    state.queue = []
    state.answers = new Map()
  })

  // Approve, Deny and Revoke take the row out of its list, so what they did is said above both
  it('has a status region in place, empty, before any decision, and says there what one did', () => {
    state.answers.set('admin-apps', { data: [application] })
    expect(render('?tab=pros').match(STATUS)?.[1]).toBe('')
    const approved = 'Robin — Licence approved. They’ll find a note in Notifications.'
    const html = render('?tab=pros', [{ from: '', nth: 1, to: approved }])
    expect(html).toMatch(/Approve licence/)
    expect(html.match(STATUS)?.[1]).toBe(approved)
  })

  it('still says what a decision did once nobody is waiting or licensed', () => {
    const revoked = 'Wren — Licensed mark revoked, on what they already wrote too.'
    const html = render('?tab=pros', [{ from: '', nth: 1, to: revoked }])
    expect(html).toMatch(NONE_WAITING)
    expect(html.match(STATUS)?.[1]).toBe(revoked)
  })

  it('doesn’t say nobody is waiting before the applications have been read', () => {
    state.answers.set('admin-apps', { loading: true })
    expect(render('?tab=pros')).not.toMatch(NONE_WAITING)
  })

  it('says nobody is waiting once the applications are read and there are none', () => {
    expect(render('?tab=pros')).toMatch(NONE_WAITING)
  })

  // A refused listen (an index still building, a moderator role just taken away) answers no rows
  it('says out loud that the applications couldn’t be read, rather than that nobody is waiting', () => {
    state.answers.set('admin-apps', { error: new Error('The index is still building.') })
    state.answers.set('admin-pros', { data: [licensed] })
    const html = render('?tab=pros')
    expect(html).toContain('<p class="error" role="alert">Couldn’t read the applications. The index is still building.</p>')
    expect(html).not.toMatch(NONE_WAITING)
    // Only the applications: who's licensed was read, and can still have the mark taken away
    expect(html).toMatch(/Licensed now.*Wren.*Revoke mark/)
  })

  it('says out loud that who’s licensed couldn’t be read, rather than leaving the section out', () => {
    state.answers.set('admin-pros', { error: new Error('You can’t do that here.') })
    const html = render('?tab=pros')
    expect(html).toMatch(/Licensed now<\/span><p class="error" role="alert">Couldn’t read who’s licensed\. You can’t do that here\.<\/p>/)
    expect(html).toMatch(NONE_WAITING)
  })
})
