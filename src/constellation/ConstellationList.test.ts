import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Profile } from '../lib/types'
import { ConstellationList } from './ConstellationList'

// The Groups chart tells screen readers to use the List view "for the same information as
// text", so the list has to say what the charts draw: friendships, requests either way,
// friends' friends, and the people in no group yet

const profile = (id: string, penName: string): Profile => ({ id, penName, avatarSeed: id, pigment: 'fresco', pro: false, banned: false })
const tie = (a: string, b: string) => ({ id: `${a}-${b}`, uids: [a, b] as [string, string] })

const props = (onSelect = vi.fn()) => ({
  constellations: [{ id: 'c1', name: 'Caring' }],
  groups: [{ id: 'g1', name: 'Evenings', constellationId: 'c1', constellationName: 'Caring' }],
  memberships: ['me', 'heron', 'river', 'harbor'].map((uid) => ({ groupId: 'g1', uid })),
  people: new Map(
    [profile('me', 'Even Tide'), profile('heron', 'Quiet Heron'), profile('river', 'Slow River'), profile('wren', 'Grey Wren'), profile('harbor', 'Late Harbor')].map((p) => [p.id, p]),
  ),
  myGroupIds: new Set(['g1']),
  me: 'me',
  friendships: [tie('me', 'heron'), tie('heron', 'river')],
  pending: [tie('wren', 'me'), tie('me', 'harbor')],
  waiting: ['wren'],
  blocked: [],
  onSelect,
})

const text = (node: ReactNode): string => {
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : ''
}

const buttons = (node: ReactNode): ReactElement<{ onClick: () => void; children?: ReactNode }>[] => {
  if (Array.isArray(node)) return node.flatMap(buttons)
  if (!isValidElement<{ onClick: () => void; children?: ReactNode }>(node)) return []
  return node.type === 'button' ? [node] : buttons(node.props.children)
}

describe('the List view', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ConstellationList, props())))

  it('says who your friends are, who asked you, who you asked, and who’s a friend’s friend', () => {
    expect(html).toContain('People connected to you')
    expect(html).toMatch(/Asked to connect with you<\/span><div[^>]*><button[^>]*>Grey Wren</)
    expect(html).toMatch(/Friends<\/span><div[^>]*><button[^>]*>Quiet Heron</)
    expect(html).toMatch(/You asked to connect<\/span><div[^>]*><button[^>]*>Late Harbor</)
    expect(html).toMatch(/Slow River<\/button> <span class="meta">through Quiet Heron</)
  })

  it('lists people in no group yet', () => {
    expect(html).toMatch(/Not in a group yet<\/h2><\/div><div[^>]*><button[^>]*>Grey Wren</)
  })

  it('says who is friends with whom', () => {
    expect(html).toContain('Quiet Heron</button><span class="meta">friends with you and Slow River</span>')
    expect(html).toContain('Slow River</button><span class="meta">friends with Quiet Heron</span>')
  })

  it('opens a person named in the new sections', () => {
    const onSelect = vi.fn()
    const asked = buttons(ConstellationList(props(onSelect))).filter((b) => text(b.props.children) === 'Grey Wren')
    expect(asked).toHaveLength(2)
    asked.forEach((b) => b.props.onClick())
    expect(onSelect.mock.calls).toEqual([['wren'], ['wren']])
  })

  it('says when no one is around you yet', () => {
    const alone = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ConstellationList, { ...props(), friendships: [], pending: [], waiting: [] })),
    )
    expect(alone).toContain('No friends or requests yet.')
  })
})
