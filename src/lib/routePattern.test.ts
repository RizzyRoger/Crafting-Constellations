import { matchRoutes, type RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { routePattern } from './routePattern'

// Same shape as App.tsx: a pathless root, a pathless gate, absolute paths
const routes: RouteObject[] = [
  {
    children: [
      { path: '/' },
      { path: '/signin' },
      {
        children: [
          { path: '/groups/:groupId' },
          { path: '/groups/:groupId/posts/:postId' },
          { path: '/messages/:pairId' },
        ],
      },
      { path: '*' },
    ],
  },
]

const patternOf = (pathname: string) => routePattern((matchRoutes(routes, pathname) ?? []).map((m) => m.route.path))

describe('routePattern', () => {
  it('reports the route, not the ids in the address', () => {
    expect(patternOf('/groups/grief-slowly')).toBe('/groups/:groupId')
    expect(patternOf('/groups/grief-slowly/posts/abc123')).toBe('/groups/:groupId/posts/:postId')
    expect(patternOf('/messages/alice_bob')).toBe('/messages/:pairId')
  })

  it('keeps fixed pages as they are', () => {
    expect(patternOf('/')).toBe('/')
    expect(patternOf('/signin')).toBe('/signin')
  })

  it('folds every unknown address into one', () => {
    expect(patternOf('/some/private/thing')).toBe('/*')
  })

  it('falls back to the front page when nothing matched', () => {
    expect(routePattern([])).toBe('/')
    expect(routePattern([undefined, undefined])).toBe('/')
  })
})
