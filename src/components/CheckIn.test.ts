import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post, Status } from '../lib/types'
import { CheckIn, type CheckInDraft } from './CheckIn'

// The check-in box as the prompt above pages and on You show it, with its two listens answered
// by hand. The query is built from stand-ins so its shape can be read; no Firebase in node
const state = vi.hoisted(() => ({
  membership: { data: { uid: 'alice' } as object | null, loading: false, error: null, pending: false },
  rows: [] as unknown[],
  error: null as Error | null,
  keys: [] as (string | null)[],
  built: [] as unknown[],
}))

vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: (e: unknown) => String(e) }))
vi.mock('./ConfirmEmail', () => ({ ConfirmEmail: () => null }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'alice', claims: { emailVerified: true } }) }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (n: number) => ({ limit: n }),
  query: (ref: unknown, ...parts: unknown[]) => ({ ref, parts }),
}))
vi.mock('../lib/live', () => ({
  useDocData: () => state.membership,
  useQueryData: (key: string | null, build: () => unknown) => {
    state.keys.push(key)
    if (!key) return { data: [], loading: false, error: null }
    state.built.push(build())
    return { data: state.rows, loading: false, error: state.error }
  },
}))

const DAY = 86_400_000
const at = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms })
const post = (id: string, status: Status, over: Partial<Post> = {}) => ({
  id,
  path: `groups/daily-check-in/posts/${id}`,
  authorUid: 'alice',
  status,
  body: 'words',
  createdAt: at(Date.now()),
  ...over,
})

// What the shell keeps for the prompt while it's away
const kept = (over: Partial<CheckInDraft>): CheckInDraft => ({
  answers: { feeling: '', mind: '', steps: '' },
  setAnswers: () => {},
  sent: null,
  setSent: () => {},
  ...over,
})

const render = (prompt: boolean, { path = '/constellation', draft }: { path?: string; draft?: Partial<CheckInDraft> } = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(CheckIn, prompt ? { prompt, onLater: () => {}, ...(draft ? { draft: kept(draft) } : {}) } : {}),
    ),
  )

// Some of the check-in, from where `from` first shows
const after = (html: string, from: string) => html.slice(html.indexOf(from))

beforeEach(() => {
  state.membership = { data: { uid: 'alice' }, loading: false, error: null, pending: false }
  state.rows = []
  state.error = null
  state.keys = []
  state.built = []
})

describe('CheckIn', () => {
  it('opens its members-only read only once the server has the membership, so the rules never refuse it', () => {
    // The shell's join, written here and not yet on the server
    state.membership = { data: { uid: 'alice' }, loading: false, error: null, pending: true }
    expect(render(true)).toBe('')
    expect(state.keys).toEqual([null])

    state.membership = { data: { uid: 'alice' }, loading: false, error: null, pending: false }
    expect(render(true)).toContain('id="checkin-feeling"')
    expect(state.keys.at(-1)).toBe('checkin|alice')
  })

  it('offers no form when today’s check-in can’t be read: it can’t tell whether one is already sent', () => {
    state.error = new Error('permission-denied')
    expect(render(true)).toBe('')
    const you = render(false)
    expect(you).toContain('can’t be opened just now')
    expect(you).not.toContain('<textarea')
  })

  it('says who reads the answers, with a way to the group, before anyone writes', () => {
    for (const prompt of [true, false]) {
      const html = render(prompt)
      const said = html.indexOf('Everyone here is in that group, so anyone can read it and reply.')
      expect(said).toBeGreaterThan(-1)
      expect(said).toBeLessThan(html.indexOf('<textarea'))
      expect(html).toContain('href="/groups/daily-check-in"')
      // Heard with each answer, since a screen reader goes straight to the fields
      expect(html.match(/<textarea[^>]*aria-describedby="checkin-who"/g)).toHaveLength(3)
      expect(html).toContain('id="checkin-who"')
    }
  })

  it('shows the writer what became of today’s check-in: its status and, when held for crisis, the resources', () => {
    state.rows = [post('p1', 'held', { heldReason: 'crisis' })]
    const held = render(false)
    expect(held).toContain('held — a person will read this first')
    expect(held).toContain('If you need someone right now')
    expect(held).toContain('href="/groups/daily-check-in/posts/p1"')
    // In the region that was there before it was sent, so a screen reader hears it
    expect(after(held, 'aria-live="polite"')).toContain('held — a person will read this first')

    state.rows = [post('p1', 'pending')]
    expect(render(false)).toContain('checking…')
    expect(render(false)).not.toContain('If you need someone right now')

    state.rows = [post('p1', 'held', { heldReason: 'review' })]
    expect(render(false)).toContain('waiting for a person to read this')
    expect(render(false)).not.toContain('If you need someone right now')
  })

  it('keeps its live region mounted with the form, so what a send becomes is heard', () => {
    expect(render(true)).toMatch(/<div class="stack live" aria-live="polite"><\/div>/)
  })

  it('stays out of the way above pages for a check-in written earlier or elsewhere', () => {
    state.rows = [post('p1', 'held', { heldReason: 'crisis' })]
    expect(render(true)).toBe('')
  })

  it('doesn’t count a withdrawn or removed check-in as today’s, so the form comes back', () => {
    for (const status of ['withdrawn', 'removed'] as const) {
      state.rows = [post('p1', status)]
      expect(render(true)).toContain('id="checkin-feeling"')
      expect(render(false)).not.toContain('You already wrote today')
    }
  })

  it('still finds an earlier check-in from today behind a withdrawn one', () => {
    state.rows = [post('p2', 'withdrawn'), post('p1', 'published', { createdAt: at(Date.now() - 1) as never })]
    expect(render(false)).toContain('You already wrote today')
    expect(render(false)).toContain('href="/groups/daily-check-in/posts/p1"')
    // So the read has to bring more than the newest one
    const parts = (state.built.at(-1) as { parts: { limit?: number }[] }).parts
    expect(parts.find((part) => part.limit)?.limit).toBeGreaterThan(1)
  })

  it('doesn’t count yesterday’s', () => {
    state.rows = [post('p1', 'published', { createdAt: at(Date.now() - 2 * DAY) as never })]
    expect(render(true)).toContain('id="checkin-feeling"')
  })

  it('shows what was typed before, kept by the shell while a page left the prompt out', () => {
    const html = render(true, { draft: { answers: { feeling: 'Tired', mind: 'The scan on Friday', steps: '' } } })
    expect(html).toMatch(/<textarea[^>]*id="checkin-feeling"[^>]*>Tired<\/textarea>/)
    expect(html).toMatch(/<textarea[^>]*id="checkin-mind"[^>]*>The scan on Friday<\/textarea>/)
  })

  it('comes back with the check-in it sent, saying what became of it, resources and all', () => {
    state.rows = [post('p1', 'held', { heldReason: 'crisis' })]
    const html = render(true, { draft: { sent: 'p1' } })
    expect(html).toContain('Sent to Daily check-in.')
    expect(html).toContain('If you need someone right now')
  })

  it('leaves the resources to the check-in’s own page, which shows them with it', () => {
    state.rows = [post('p1', 'held', { heldReason: 'crisis' })]
    // Read as the router reads the address: any case, a trailing slash
    for (const path of ['/groups/daily-check-in/posts/p1', '/Groups/daily-check-in/Posts/p1/']) {
      for (const html of [render(true, { path, draft: { sent: 'p1' } }), render(false, { path })]) {
        expect(html).toContain('held — a person will read this first')
        expect(html).not.toContain('If you need someone right now')
      }
    }
    // Another post's page, or a post of the same id in another group, doesn't show them
    for (const path of ['/groups/daily-check-in/posts/p2', '/groups/other/posts/p1', '/me']) {
      expect(render(true, { path, draft: { sent: 'p1' } })).toContain('If you need someone right now')
    }
  })

  it('says why Send waits, next to it', () => {
    const html = render(true)
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*aria-describedby="checkin-ready"/)
    expect(html).toContain('<span id="checkin-ready" class="hint">Answer all three to send.</span>')
  })
})
