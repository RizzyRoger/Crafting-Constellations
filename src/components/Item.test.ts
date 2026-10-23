import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Content } from '../lib/types'
import { Item } from './Item'

// One piece of writing as each place shows it; no Firebase in node
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }))

const willow = { penName: 'Willow', avatarSeed: 's', pigment: 'paynesBlue', pro: true }

const render = (variant: 'bubble' | 'comment' | 'card', over: Partial<Content> = {}, me = 'me') =>
  renderToStaticMarkup(
    createElement(Item, {
      item: { id: 'c1', path: 'groups/g/posts/p/comments/c1', authorUid: 'willow', status: 'published', createdAt: null, author: willow, ...over },
      me,
      variant,
      children: createElement('p', { className: 'voice' }, 'the words'),
    }),
  )

// Talk and private notes are bubbles; a post's comments are comment rows
const talking = ['bubble', 'comment'] as const

describe('Item', () => {
  it('names who wrote talk and comments, with the licensed mark, not only a decorative blot', () => {
    for (const variant of talking) {
      const html = render(variant)
      expect(html).toContain('<span class="who__name">Willow</span>')
      expect(html).toContain('<span class="licensed circled"')
      // The name is in words; the blot stays decorative
      expect(html).not.toMatch(/<img[^>]*alt="[^"]/)
    }
  })

  it('says a bubble is mine to a screen reader, and keeps my licensed mark in sight', () => {
    const html = render('bubble', { authorUid: 'me' })
    expect(html).toContain('<span class="visually-hidden">You</span>')
    expect(html).not.toContain('Willow')
    expect(html).toContain('<span class="licensed circled"')
  })

  it('names my comment as everyone else sees it', () => {
    const html = render('comment', { authorUid: 'me' })
    expect(html).toContain('<span class="who__name">Willow</span>')
  })

  it('leaves the head of my plain bubble empty, so it takes no room', () => {
    const html = render('bubble', { authorUid: 'me', author: { ...willow, pro: false } })
    expect(html).toContain('<div class="item__head"></div>')
  })

  it('tells me my talk or comment is waiting, and why', () => {
    for (const variant of talking) {
      expect(render(variant, { authorUid: 'me', status: 'pending' })).toContain('checking…')
      expect(render(variant, { authorUid: 'me', status: 'held', heldReason: 'review' })).toContain('waiting for a person to read this')
      expect(render(variant, { authorUid: 'me', status: 'held', heldReason: 'crisis' })).toContain('held — a person will read this first')
    }
  })

  it('promises a person reads my held crisis note before others see it', () => {
    for (const variant of talking) {
      const html = render(variant, { authorUid: 'me', status: 'held', heldReason: 'crisis' })
      expect(html).toContain('href="tel:988"')
      expect(html).toContain('before others see it')
    }
  })

  it('keeps the resources on my undelivered crisis note, but not the promise others will see it', () => {
    for (const variant of talking) {
      const html = render(variant, { authorUid: 'me', status: 'held', heldReason: 'crisis', undelivered: true })
      expect(html).toContain('not delivered — it won’t reach them')
      expect(html).toContain('href="tel:988"')
      expect(html).not.toContain('before others see it')
    }
  })

  it('tells nobody else', () => {
    for (const variant of talking) {
      const html = render(variant, { status: 'held', heldReason: 'review' })
      expect(html).not.toContain('status-note')
    }
  })

  it('offers Withdraw only while the rules will take it back', () => {
    for (const variant of [...talking, 'card'] as const) {
      for (const status of ['pending', 'published', 'held'] as const) {
        expect(render(variant, { authorUid: 'me', status })).toContain('>Withdraw</button>')
      }
      for (const status of ['withdrawn', 'removed'] as const) {
        const html = render(variant, { authorUid: 'me', status })
        expect(html).not.toContain('Withdraw')
        expect(html).not.toContain('Report')
      }
    }
  })
})
