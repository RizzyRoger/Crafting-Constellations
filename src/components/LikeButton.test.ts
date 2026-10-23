import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LikeButton } from './LikeButton'

// Keep the SDK from starting in node; the like doc is whatever each case says
const like = vi.hoisted(() => ({ data: null as { uid: string } | null }))
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/live', () => ({ useDocData: () => ({ data: like.data, loading: false, error: null, pending: false }) }))

const render = (count?: number) => renderToStaticMarkup(createElement(LikeButton, { postPath: 'groups/g/posts/p', me: 'u1', count }))
const nameOf = (html: string) => html.match(/<button[^>]*aria-label="([^"]*)"/)?.[1]

describe('LikeButton', () => {
  beforeEach(() => {
    like.data = null
  })

  it('names its count to a screen reader', () => {
    expect(nameOf(render(3))).toBe('Like, 3 likes')
  })

  it('keeps one name when pressed, and leaves the state to aria-pressed', () => {
    like.data = { uid: 'u1' }
    const html = render(3)
    expect(nameOf(html)).toBe('Like, 3 likes')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"/)
  })

  it('is just Like with nobody liking it yet', () => {
    expect(nameOf(render(0))).toBe('Like')
    expect(nameOf(render())).toBe('Like')
  })

  it('says one like, not one likes', () => {
    expect(nameOf(render(1))).toBe('Like, 1 like')
  })

  it('has no hidden text the name would hide', () => {
    expect(render(3)).not.toMatch(/visually-hidden/)
  })
})
