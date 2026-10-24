import { FirebaseError } from 'firebase/app'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignIn } from './SignIn'

// What SignIn's Forgot password says once Firebase answers. No DOM in node, so useState is a
// stand-in (as in accountPages.test.ts): `draw` runs the page with the state it kept from the
// last draw, so a test can type, press, and draw again to see what it says
const react = vi.hoisted(() => {
  type Slot = { value?: unknown }
  let slots: Slot[] = []
  let at = 0
  return {
    useState: <S>(initial: S) => {
      const s = (slots[at++] ??= {})
      if (!('value' in s)) s.value = initial
      const set = (next: S) => {
        s.value = next
      }
      return [s.value as S, set] as const
    },
    draw: (page: Slot[], component: () => ReactNode): ReactNode => {
      slots = page
      at = 0
      return component()
    },
  }
})
// What Firebase does with the reset request; each test says
const firebase = vi.hoisted(() => ({ sendPasswordResetEmail: async (): Promise<void> => {} }))

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useState: react.useState }))
vi.mock('react-router-dom', () => ({
  Link: () => null,
  useLocation: () => ({ pathname: '/signin', search: '', hash: '', state: null }),
  useNavigate: () => () => {},
}))
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  sendPasswordResetEmail: () => firebase.sendPasswordResetEmail(),
}))
vi.mock('../lib/firebase', () => ({ auth: {}, db: {}, functions: {}, LOCAL_BACKEND: false, USING_EMULATORS: false, APP_CHECK_ON: false }))
vi.mock('../lib/telemetry', () => ({ trackSignIn: vi.fn() }))
vi.mock('../auth/pausedNote', () => ({ usePausedNote: () => false }))

type Drawn = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isDrawn = (node: unknown): node is Drawn => typeof node === 'object' && node !== null && 'props' in node
const find = (node: ReactNode, match: (el: Drawn) => boolean): Drawn | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, match)).find(Boolean) ?? null
  if (!isDrawn(node)) return null
  return match(node) ? node : find(node.props.children, match)
}

const RESET = 'If that email has an account, a reset link is on its way.'
const said = (tree: ReactNode, role: 'status' | 'alert') => find(tree, (el) => el.props.role === role)?.props.children ?? null

// Types the address, presses Forgot password, and gives what the page says once Firebase has answered
const askForLink = async (page: { value?: unknown }[], address: string) => {
  const input = find(react.draw(page, SignIn), (el) => el.props.id === 'email')!
  ;(input.props.onChange as (e: unknown) => void)({ target: { value: address } })
  const button = find(react.draw(page, SignIn), (el) => el.type === 'button' && el.props.children === 'Forgot password')!
  ;(button.props.onClick as () => void)()
  await new Promise((settle) => setTimeout(settle))
  const tree = react.draw(page, SignIn)
  return { alert: said(tree, 'alert'), status: said(tree, 'status') }
}

const refuse = (code: string) => () => Promise.reject(new FirebaseError(code, ''))

beforeEach(() => {
  firebase.sendPasswordResetEmail = async () => {}
})

describe('SignIn’s Forgot password when the link didn’t go', () => {
  it('says there’s no connection, rather than that a link is on its way', async () => {
    firebase.sendPasswordResetEmail = refuse('auth/network-request-failed')
    expect(await askForLink([], 'ash@example.com')).toEqual({ alert: 'No connection. Check your internet and try again.', status: null })
  })

  it('says a malformed address isn’t one, since the button skips the form’s own check', async () => {
    firebase.sendPasswordResetEmail = refuse('auth/invalid-email')
    expect(await askForLink([], 'jane@')).toEqual({ alert: 'That doesn’t look like an email address.', status: null })
  })

  it('says to wait after too many tries', async () => {
    firebase.sendPasswordResetEmail = refuse('auth/too-many-requests')
    expect(await askForLink([], 'ash@example.com')).toEqual({ alert: 'Too many tries. Wait a minute, then try again.', status: null })
  })

  it('drops the reason once a later try goes through', async () => {
    const page: { value?: unknown }[] = []
    firebase.sendPasswordResetEmail = refuse('auth/network-request-failed')
    await askForLink(page, 'ash@example.com')
    firebase.sendPasswordResetEmail = async () => {}
    expect(await askForLink(page, 'ash@example.com')).toEqual({ alert: null, status: RESET })
  })
})

describe('SignIn’s Forgot password never tells whether an email has an account', () => {
  // No such account (the emulator, or a project without enumeration protection), a paused one,
  // or a send that failed once the account was found
  it.each(['auth/user-not-found', 'auth/user-disabled', 'auth/invalid-recipient-email'])('answers %s as if a link went', async (code) => {
    firebase.sendPasswordResetEmail = refuse(code)
    expect(await askForLink([], 'ash@example.com')).toEqual({ alert: null, status: RESET })
  })
})
