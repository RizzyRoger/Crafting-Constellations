import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Messages } from './Messages'

// A ban keeps the person's connections (an unban brings them back), but they can never
// read a note, so the page mustn't offer to write to them. Lists come from the keys asked.

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  loading: new Set<string>(),
}))

vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, LOCAL_BACKEND: true }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({ uid: 'alice', claims: { admin: false, pro: false, banned: false, emailVerified: true } }),
}))
vi.mock('../lib/live', () => ({
  useQueryData: (key: string | null) => ({
    data: state.loading.has(key ?? '') ? [] : (key && state.rows[key]) ?? [],
    loading: state.loading.has(key ?? ''),
    error: null,
  }),
}))

const person = (id: string, banned = false): Row => ({ id, penName: id[0].toUpperCase() + id.slice(1), avatarSeed: id, pigment: 'ultramarine', pro: false, banned })

const connected = (other: string): Row => {
  const uids = ['alice', other].sort()
  return { id: uids.join('_'), uids, requester: 'alice', recipient: other, status: 'accepted' }
}

const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Messages)))

// The "Connected, not yet written" section only
const quiet = (html: string) => html.split('id="connected"')[1]?.split('</section>')[0] ?? ''

beforeEach(() => {
  state.loading.clear()
  state.rows = {
    'connections|alice': [connected('bob'), connected('cara')],
    'threads|alice': [],
    people: [person('alice'), person('bob', true), person('cara')],
  }
})

describe('Messages', () => {
  it('offers to write only to connections who are not banned', () => {
    const section = quiet(render())
    expect(section).toContain('Cara')
    expect(section).not.toContain('Bob')
    expect(section).not.toContain('/messages/alice_bob')
    expect(section.match(/>Write</g)).toHaveLength(1)
  })

  it('leaves out the section, and says how to start, when the only connection is banned', () => {
    state.rows['connections|alice'] = [connected('bob')]
    const html = render()
    expect(html).not.toContain('Connected, not yet written')
    expect(html).toContain('To write privately, reach out')
  })

  it('keeps a conversation already written with someone since banned, so its history can be read', () => {
    state.rows['threads|alice'] = [{ id: 'alice_bob', uids: ['alice', 'bob'], lastMessageAt: null, lastAuthorUid: 'bob' }]
    const html = render()
    expect(html).toContain('href="/messages/alice_bob"')
    expect(quiet(html)).not.toContain('Bob')
  })

  it('does not tell someone with friends to go and find some while the lists are still coming', () => {
    state.loading.add('people')
    expect(render()).not.toContain('To write privately, reach out')
  })
})
