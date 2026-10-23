import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from './App'

// No browser or Firebase in node: the app's own router is never started, and the rail is a marker
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  createBrowserRouter: () => ({}),
}))
vi.mock('./lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {}, storage: {}, LOCAL_BACKEND: false, USING_EMULATORS: false, APP_CHECK_ON: false }))
vi.mock('./components/ConsentNote', () => ({ ConsentNote: () => null }))
vi.mock('./components/Shell', () => ({
  Shell: ({ children }: { children: ReactNode }) => createElement('div', { className: 'rail-marker' }, children),
}))
// Review's code went with a deploy: the tab asks for a file that's gone
vi.mock('./pages/Admin', () => {
  throw new Error('Failed to fetch dynamically imported module')
})
vi.mock('./auth/AuthProvider', () => {
  const me = { user: { uid: 'a' }, profile: { id: 'a', penName: 'Ash' }, claims: { admin: true, pro: false, banned: false, emailVerified: true } }
  return {
    AuthProvider: ({ children }: { children: ReactNode }) => children,
    useAuth: () => ({ ...me, loading: false, paused: false, refreshClaims: async () => undefined }),
    useMe: () => ({ ...me, uid: 'a', refreshClaims: async () => undefined }),
  }
})

// The page at `path` fails. React Router sends an error to the nearest route with an errorElement
// whether a loader throws or the page throws while drawing (a lazy chunk that's gone after a
// deploy, doc() on an address it can't read); a loader is the one way to throw in node
const failing = (list: RouteObject[], path: string): RouteObject[] =>
  list.map((route) => {
    if (route.path === path) {
      return {
        ...route,
        loader: () => {
          throw new Error('Failed to fetch dynamically imported module')
        },
      } as RouteObject
    }
    return route.children ? ({ ...route, children: failing(route.children, path) } as RouteObject) : route
  })

const open = async (path: string, url = path) => {
  const router = createMemoryRouter(failing(routes, path), { initialEntries: [url] })
  await vi.waitFor(() => expect(router.state.initialized).toBe(true))
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

describe('a page that fails to open', () => {
  it('shows a Reload note inside the rail, never the router’s developer screen', async () => {
    for (const [path, url] of [
      ['/admin', '/admin'],
      ['/messages/:pairId', '/messages/a_a'],
      ['/groups/:groupId', '/groups/a%2Fb'],
    ]) {
      const html = await open(path, url)
      expect(html, url).not.toMatch(/Unexpected Application Error/)
      expect(html, url).toMatch(/<div class="rail-marker"><div class="quiet" role="status">This page didn’t open\./)
      expect(html, url).toMatch(/<button type="button" class="link-btn">Reload<\/button>/)
    }
  })

  it('stands alone outside the rail, with a way home', async () => {
    const html = await open('/signin')
    expect(html).not.toMatch(/Unexpected Application Error/)
    expect(html).not.toMatch(/rail-marker/)
    expect(html).toMatch(/<h1 class="auth__title">This page didn’t open<\/h1>/)
    expect(html).toMatch(/>Reload<\/button>/)
    expect(html).toMatch(/<a class="act" href="\/"[^>]*>Back to the front<\/a>/)
  })
})

describe('Review’s code gone after a deploy', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reloads the tab once to fetch the new release', async () => {
    const reload = vi.fn()
    const items = new Map<string, string>()
    vi.stubGlobal('window', { location: { reload } })
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) })
    const router = createMemoryRouter(routes, { initialEntries: ['/admin'] })
    await vi.waitFor(() => expect(router.state.initialized).toBe(true))
    expect(renderToStaticMarkup(createElement(RouterProvider, { router }))).toMatch(/Opening the review sheet…/)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })
})
