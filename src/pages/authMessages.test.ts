import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SignIn } from './SignIn'
import { Verify } from './Verify'

// A first render needs no Firebase; keep the SDK from starting in node
vi.mock('../lib/firebase', () => ({ auth: {}, USING_EMULATORS: false, APP_CHECK_ON: false }))
vi.mock('../lib/telemetry', () => ({ trackSignIn: vi.fn() }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, claims: { emailVerified: false }, profile: null, refreshClaims: vi.fn() }),
}))

const render = (page: ComponentType) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(page)))

// A polite region that arrives already holding its text is often never read,
// so the note's region has to be on the page, empty, before anything happens
describe('auth pages announce their notes', () => {
  it('SignIn keeps an empty status region for the reset note', () => {
    expect(render(SignIn)).toMatch(/<p class="hint live" role="status"><\/p>/)
  })

  it('Verify keeps an empty status region for "Sent again" and "Not confirmed yet"', () => {
    expect(render(Verify)).toMatch(/<p class="hint live" role="status"><\/p>/)
  })
})
