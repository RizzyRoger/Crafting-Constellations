import { FirebaseError } from 'firebase/app'
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmEmail } from '../components/ConfirmEmail'
import { Landing } from './Landing'
import { SignIn } from './SignIn'
import { Verify } from './Verify'

// What the account pages say and where they go once something is pressed. No DOM in node, so a
// stand-in for React's hooks (as in live.test.ts): `draw` runs a page and gives what it returns,
// `commit` runs the effects that draw queued, as React does after it. A page keeps its state
// between draws, so a test can press a button and draw the page again to see what it says
const react = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: unknown }
  let slots: Slot[] = []
  let at = 0
  let effects: (() => void)[] = []
  const slot = () => (slots[at++] ??= {})
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  return {
    useState: <S>(initial: S) => {
      const s = slot()
      if (!('value' in s)) s.value = initial
      const set = (next: S | ((last: S) => S)) => {
        s.value = typeof next === 'function' ? (next as (last: S) => S)(s.value as S) : next
      }
      return [s.value as S, set] as const
    },
    useRef: <T>(initial: T) => {
      const s = slot()
      if (!('value' in s)) s.value = { current: initial }
      return s.value as { current: T }
    },
    useEffect: (run: () => void | (() => void), deps: unknown[]) => {
      const s = slot()
      if (same(s.deps, deps)) return
      s.deps = deps
      effects.push(() => {
        if (typeof s.cleanup === 'function') s.cleanup()
        s.cleanup = run()
      })
    },
    page: (): Slot[] => [],
    draw: (page: Slot[], component: () => ReactNode): ReactNode => {
      slots = page
      at = 0
      return component()
    },
    commit: () => {
      const queued = effects
      effects = []
      queued.forEach((run) => run())
    },
  }
})

const router = vi.hoisted(() => ({ location: { pathname: '/', search: '', hash: '', state: null as unknown } }))
const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
// What Firebase does with each request; each test says
const firebase = vi.hoisted(() => ({
  sendEmailVerification: async () => {},
  sendPasswordResetEmail: async () => {},
  signInWithEmailAndPassword: async (): Promise<unknown> => ({}),
}))

vi.mock('react', () => react)
vi.mock('react-router-dom', () => ({
  Link: () => null,
  useLocation: () => router.location,
  useNavigate: () => () => {},
}))
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  sendEmailVerification: () => firebase.sendEmailVerification(),
  sendPasswordResetEmail: () => firebase.sendPasswordResetEmail(),
  signInWithEmailAndPassword: () => firebase.signInWithEmailAndPassword(),
}))
vi.mock('../lib/firebase', () => ({ auth: {}, db: {}, functions: {}, LOCAL_BACKEND: false, USING_EMULATORS: false, APP_CHECK_ON: false }))
vi.mock('../lib/telemetry', () => ({ trackSignIn: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => auth.current }))
vi.mock('../auth/pausedNote', () => ({ usePausedNote: () => false }))

type Drawn = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isDrawn = (node: unknown): node is Drawn => typeof node === 'object' && node !== null && 'props' in node
const find = (node: ReactNode, match: (el: Drawn) => boolean): Drawn | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, match)).find(Boolean) ?? null
  if (!isDrawn(node)) return null
  return match(node) ? node : find(node.props.children, match)
}

const said = (tree: ReactNode, role: 'status' | 'alert') => find(tree, (el) => el.props.role === role)?.props.children ?? null
const link = (tree: ReactNode, label: string) => {
  const found = find(tree, (el) => el.type === Link && el.props.children === label)
  return found && { to: found.props.to, state: found.props.state }
}
// A press, then whatever Firebase's answer sets off
const press = async (tree: ReactNode, label: string) => {
  const button = find(tree, (el) => el.type === 'button' && el.props.children === label)
  expect(button, label).not.toBeNull()
  const onClick = button!.props.onClick as () => void
  onClick()
  await new Promise((settle) => setTimeout(settle))
}

const at = (pathname: string, search = '', state: unknown = null) => ({ pathname, search, hash: '', state })

beforeEach(() => {
  router.location = at('/verify')
  auth.current = {
    user: { uid: 'u1', emailVerified: false },
    claims: { emailVerified: false },
    profile: { id: 'u1', penName: 'Ash' },
    refreshClaims: async () => ({}),
  }
  firebase.sendEmailVerification = async () => {}
  firebase.sendPasswordResetEmail = async () => {}
  firebase.signInWithEmailAndPassword = async () => ({})
})

describe('Verify says what happened', () => {
  it('says why "Send it again" didn’t send, rather than "Sent again"', async () => {
    firebase.sendEmailVerification = () => Promise.reject(new FirebaseError('auth/too-many-requests', ''))
    const page = react.page()
    await press(react.draw(page, Verify), 'Send it again')
    expect(said(react.draw(page, Verify), 'status')).toBe('Too many tries. Wait a minute, then try again.')
  })

  it('says "Sent again" when it was', async () => {
    const page = react.page()
    await press(react.draw(page, Verify), 'Send it again')
    expect(said(react.draw(page, Verify), 'status')).toBe('Sent again. It can take a minute.')
  })

  it('says why "I’ve confirmed it" couldn’t check, rather than nothing', async () => {
    auth.current.refreshClaims = () => Promise.reject(new FirebaseError('auth/network-request-failed', ''))
    const page = react.page()
    await press(react.draw(page, Verify), 'I’ve confirmed it')
    expect(said(react.draw(page, Verify), 'status')).toBe('No connection. Check your internet and try again.')
  })

  it('says "Not confirmed yet" when the check finds it isn’t', async () => {
    const page = react.page()
    await press(react.draw(page, Verify), 'I’ve confirmed it')
    expect(said(react.draw(page, Verify), 'status')).toBe('Not confirmed yet. Open the link in the email, then try again.')
  })
})

describe('confirming an email goes back to the page that asked for it', () => {
  const from = '/groups/abc?tab=posts'

  it('ConfirmEmail remembers the page it’s on, query and all', () => {
    router.location = at('/groups/abc', '?tab=posts')
    expect(link(react.draw(react.page(), ConfirmEmail), 'Confirm email')).toEqual({ to: '/verify', state: { from } })
  })

  it('Continue goes back there once the email is confirmed', () => {
    router.location = at('/verify', '', { from })
    auth.current.claims = { emailVerified: true }
    expect(link(react.draw(react.page(), Verify), 'Continue')).toEqual({ to: from, state: undefined })
  })

  it('Later goes back there too', () => {
    router.location = at('/verify', '', { from })
    expect(link(react.draw(react.page(), Verify), 'Later')).toEqual({ to: from, state: undefined })
  })

  it('goes to their constellation when nothing asked, and never to another site', () => {
    expect(link(react.draw(react.page(), Verify), 'Later')).toEqual({ to: '/constellation', state: undefined })
    router.location = at('/verify', '', { from: '//elsewhere.example/' })
    expect(link(react.draw(react.page(), Verify), 'Later')).toEqual({ to: '/constellation', state: undefined })
  })

  it('has someone with no pen name choose one first, carrying the page on', () => {
    router.location = at('/verify', '', { from })
    auth.current.profile = null
    expect(link(react.draw(react.page(), Verify), 'Later')).toEqual({ to: '/onboarding', state: { from } })
  })
})

describe('SignIn’s Forgot password', () => {
  const RESET = 'If that email has an account, a reset link is on its way.'
  const typeEmail = (tree: ReactNode, value: string) =>
    (find(tree, (el) => el.props.id === 'email')!.props.onChange as (e: unknown) => void)({ target: { value } })

  it('drops "Write your email above first." once the email is there and a link is on its way', async () => {
    router.location = at('/signin')
    const page = react.page()
    await press(react.draw(page, SignIn), 'Forgot password')
    expect(said(react.draw(page, SignIn), 'alert')).toBe('Write your email above first.')
    typeEmail(react.draw(page, SignIn), 'ash@example.com')
    await press(react.draw(page, SignIn), 'Forgot password')
    const tree = react.draw(page, SignIn)
    expect(said(tree, 'alert')).toBeNull()
    expect(said(tree, 'status')).toBe(RESET)
  })

  it('drops an earlier sign-in error too', async () => {
    router.location = at('/signin')
    firebase.signInWithEmailAndPassword = () => Promise.reject(new FirebaseError('auth/invalid-credential', ''))
    const page = react.page()
    typeEmail(react.draw(page, SignIn), 'ash@example.com')
    const form = find(react.draw(page, SignIn), (el) => el.type === 'form')!
    await (form.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => {} })
    expect(said(react.draw(page, SignIn), 'alert')).toBe('That email and password don’t match.')
    await press(react.draw(page, SignIn), 'Forgot password')
    const tree = react.draw(page, SignIn)
    expect(said(tree, 'alert')).toBeNull()
    expect(said(tree, 'status')).toBe(RESET)
  })

  it('drops an older reset note when the email has since been emptied', async () => {
    router.location = at('/signin')
    const page = react.page()
    typeEmail(react.draw(page, SignIn), 'ash@example.com')
    await press(react.draw(page, SignIn), 'Forgot password')
    typeEmail(react.draw(page, SignIn), '')
    await press(react.draw(page, SignIn), 'Forgot password')
    const tree = react.draw(page, SignIn)
    expect(said(tree, 'alert')).toBe('Write your email above first.')
    expect(said(tree, 'status')).toBeNull()
  })
})

describe('the front page after deleting an account', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    auth.current = { user: null, profile: null }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves focus to the note that it’s gone, so screen readers read it out', () => {
    router.location = at('/', '', { left: true })
    const page = react.page()
    const note = find(react.draw(page, Landing), (el) => el.props.role === 'status')
    expect(note?.props.children).toBe('Your account and your writing have been removed.')
    expect(note?.props.tabIndex).toBe(-1)
    // React attaches the element before running effects
    const focus = vi.fn()
    const ref = note?.props.ref as { current: unknown } | undefined
    if (ref) ref.current = { focus }
    react.commit()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('has no such note on an ordinary visit', () => {
    router.location = at('/')
    expect(find(react.draw(react.page(), Landing), (el) => el.props.role === 'status')).toBeNull()
  })
})
