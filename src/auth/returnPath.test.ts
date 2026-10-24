import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Onboarding } from '../pages/Onboarding'
import { SignIn } from '../pages/SignIn'
import { SignUp } from '../pages/SignUp'
import { Gate } from './Gate'

// Someone opens a shared address before they can see it, signs in or makes a pen name,
// and should land on that same address. No Firebase in node; redirects and links are
// drawn with where they go and the state they carry, since nothing navigates in a first render
const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../lib/firebase', () => ({ auth: {}, db: {}, functions: {}, LOCAL_BACKEND: false, USING_EMULATORS: false, APP_CHECK_ON: false }))
vi.mock('../lib/telemetry', () => ({ trackSignIn: vi.fn() }))
vi.mock('./AuthProvider', () => ({ useAuth: () => auth.current }))
vi.mock('react-router-dom', async (original) => {
  const { createElement: h } = await import('react')
  const drawn = (to: unknown, state: unknown, children?: ReactNode) =>
    h('a', { 'data-to': String(to), 'data-state': JSON.stringify(state ?? null) }, children)
  return {
    ...(await original<typeof import('react-router-dom')>()),
    Navigate: ({ to, state }: { to: string; state?: unknown }) => drawn(to, state, 'redirect'),
    Link: ({ to, state, children }: { to: string; state?: unknown; children?: ReactNode }) => drawn(to, state, children),
  }
})

const signedOut = { user: null, profile: null, claims: { admin: false }, loading: false, paused: false }
const noProfile = { ...signedOut, user: { uid: 'u1' } }
const withProfile = { ...noProfile, profile: { id: 'u1', penName: 'Ash' } }

const render = (node: ReactNode, entry: string | { pathname: string; search?: string; state?: unknown }) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [entry] }, node))

const from = '/groups/abc?tab=posts'
const carrying = (to: string) => `data-to="${to}" data-state="${JSON.stringify({ from }).replace(/"/g, '&quot;')}"`
const redirect = (html: string) => html.match(/<a data-to="[^"]*" data-state="[^"]*">redirect<\/a>/)?.[0]

beforeEach(() => {
  auth.current = signedOut
})

describe('Gate remembers the whole address', () => {
  it('sends a signed-out person to sign in with the query string kept', () => {
    const html = render(createElement(Gate, { need: 'profile', children: 'page' }), '/groups/abc?tab=posts')
    expect(redirect(html)).toBe(`<a ${carrying('/signin')}>redirect</a>`)
  })

  it('sends someone without a pen name to choose one, remembering where they were going', () => {
    auth.current = noProfile
    const html = render(createElement(Gate, { need: 'profile', children: 'page' }), '/groups/abc?tab=posts')
    expect(redirect(html)).toBe(`<a ${carrying('/onboarding')}>redirect</a>`)
  })
})

describe('the address is carried through sign-in and sign-up', () => {
  it('SignIn passes it on to "Make a pen name"', () => {
    const html = render(createElement(SignIn), { pathname: '/signin', state: { from } })
    expect(html).toContain(`<a ${carrying('/signup')}>Make a pen name</a>`)
  })

  it('SignUp passes it back to "Sign in"', () => {
    const html = render(createElement(SignUp), { pathname: '/signup', state: { from } })
    expect(html).toContain(`<a ${carrying('/signin')}>Sign in</a>`)
  })
})

describe('Onboarding sends them on', () => {
  beforeEach(() => {
    auth.current = withProfile
  })

  it('to the address they were opening', () => {
    const html = render(createElement(Onboarding), { pathname: '/onboarding', state: { from } })
    expect(redirect(html)).toBe(`<a data-to="${from}" data-state="null">redirect</a>`)
  })

  it('to their constellation when there was none', () => {
    expect(redirect(render(createElement(Onboarding), '/onboarding'))).toBe('<a data-to="/constellation" data-state="null">redirect</a>')
  })

  it('never to another site', () => {
    const html = render(createElement(Onboarding), { pathname: '/onboarding', state: { from: '//elsewhere.example/' } })
    expect(redirect(html)).toBe('<a data-to="/constellation" data-state="null">redirect</a>')
  })
})

describe('SignIn after a pause', () => {
  it('says why the account was signed out, in the words a refused sign-in gets', () => {
    auth.current = { ...signedOut, paused: true }
    expect(render(createElement(SignIn), '/signin')).toContain(
      '<p class="error" role="alert">A moderator has paused this account, so it can’t sign in.</p>',
    )
  })

  it('says nothing of the kind otherwise', () => {
    expect(render(createElement(SignIn), '/signin')).not.toContain('role="alert"')
  })
})
