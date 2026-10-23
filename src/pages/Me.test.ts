import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConsentNote } from '../components/ConsentNote'
import { Me } from './Me'

// Counting sends real page addresses, so the hint by its checkbox on "You" has to say what the
// consent note says, not just "which pages open". Counting is offered and not yet answered here;
// no Firebase in node
vi.mock('../lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('../lib/telemetry', () => ({ TELEMETRY_AVAILABLE: true, useCountVisits: () => null, setCountVisits: vi.fn() }))
vi.mock('../components/ProfileForm', () => ({ ProfileForm: () => null }))
vi.mock('../components/CheckIn', () => ({ CheckIn: () => null }))
vi.mock('../auth/AuthProvider', () => ({
  useMe: () => ({
    uid: 'alice',
    profile: { id: 'alice', penName: 'Alice', avatarSeed: 'alice', pigment: 'ochre', pro: false, banned: false },
    claims: { admin: false, pro: false, banned: false, emailVerified: true },
    user: { email: 'alice@example.com' },
  }),
}))
vi.mock('../lib/live', () => ({ useQueryData: () => ({ data: [], loading: false, error: null }) }))

const render = (component: FunctionComponent) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component)))

// The words beside the checkbox
const hint = (html: string) => html.split('Count my visits on this device')[1]?.split('</label>')[0] ?? ''

describe('Me', () => {
  it('says beside the counting checkbox what is sent, as the consent note does', () => {
    const me = hint(render(Me))
    const consent = render(ConsentNote)
    for (const said of ['page addresses', 'account, group, post and chat ids and a group’s name', 'never your name or anything you write']) {
      expect(me).toContain(said)
      expect(consent).toContain(said)
    }
    expect(me).not.toContain('which pages open')
  })
})
