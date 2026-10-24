import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Admin } from './Admin'

// What reporters wrote under 'Anything else' is read from the reports on the writing, and shown
// to moderators on the queue entry: never who wrote it, and never to the person reported

const state = vi.hoisted(() => ({
  me: 'mod',
  rows: new Map<string | null, unknown[]>(),
  keys: [] as (string | null)[],
}))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn(), problemOf: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: state.me, refreshClaims: vi.fn() }) }))
vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null) => {
    state.keys.push(key)
    return { data: state.rows.get(key) ?? [], loading: false, error: null }
  },
}))
vi.mock('../components/PageHead', () => ({ PageHead: () => null }))

const at = (seconds: number) => ({ seconds, nanoseconds: 0, toMillis: () => seconds * 1000, toDate: () => new Date(seconds * 1000) })

const entry = {
  id: 'groups~g1~posts~p1',
  contentPath: 'groups/g1/posts/p1',
  kind: 'post',
  groupId: 'g1',
  authorUid: 'writer-uid',
  authorPenName: 'Bramble',
  snapshot: { text: 'A long day.' },
  reports: { count: 1, reasons: ['other'], reporterUids: ['reporter-uid'] },
  priority: 1,
  state: 'open',
  createdAt: null,
}

const REPORTS = 'admin-reports|groups/g1/posts/p1'

const render = () => {
  state.keys = []
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/admin'] }, createElement(Admin)))
}

describe('what reporters wrote', () => {
  beforeEach(() => {
    state.me = 'mod'
    state.rows = new Map([
      ['admin-queue', [entry]],
      [
        REPORTS,
        [
          { id: 'r1', reporterUid: 'reporter-uid', contentPath: entry.contentPath, reason: 'other', details: 'They keep making new accounts to message me', createdAt: at(300) },
          // Turned away by the server: the person couldn't see it
          { id: 'r2', reporterUid: 'outsider-uid', contentPath: entry.contentPath, reason: 'other', details: 'Not in the group', createdAt: at(310) },
        ],
      ],
    ])
  })

  it('shows a moderator what the round’s reporters wrote, under the entry, with no uid', () => {
    const html = render()
    expect(state.keys).toContain(REPORTS)
    expect(html).toContain('<dl class="admin-dl"><dt>other</dt><dd>They keep making new accounts to message me</dd></dl>')
    expect(html).not.toContain('Not in the group')
    expect(html).not.toMatch(/reporter-uid|outsider-uid/)
  })

  it('never reads them for the moderator who is the one reported', () => {
    state.me = 'writer-uid'
    const html = render()
    expect(state.keys).not.toContain(REPORTS)
    expect(html).not.toContain('They keep making new accounts')
    expect(html).toContain('This is about you, so what reporters wrote is left for another moderator.')
  })
})
