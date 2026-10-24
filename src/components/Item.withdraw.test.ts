import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Item } from './Item'

// A withdrawn bubble is filtered out at once, so the next one of mine slides under the pointer and
// the second click of a double-click on Withdraw would take that one back too, for good. No
// Firebase in node
const taken = vi.hoisted(() => ({ paths: [] as string[] }))

vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/withdraw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/withdraw')>()),
  withdraw: async (path: string) => {
    taken.paths.push(path)
    return null
  },
}))

type Clickable = ReactElement<{ children?: ReactNode; onClick?: (e: { detail: number }) => unknown }>

const findButton = (node: ReactNode, label: string): Clickable | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => findButton(child, label)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === 'button' && node.props.children === label) return node as Clickable
  return findButton(node.props.children, label)
}

// My pending note as a bubble, read inside a render so its hooks run
const withdrawButton = () => {
  let tree = null as ReactNode
  const Probe = () => {
    tree = Item({
      item: { id: 'm1', path: 'dms/a_b/messages/m1', authorUid: 'me', status: 'pending', createdAt: null },
      me: 'me',
      variant: 'bubble',
      children: null,
    })
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  const button = findButton(tree, 'Withdraw')
  expect(button).not.toBeNull()
  return button!
}

beforeEach(() => {
  taken.paths = []
})

describe('Withdraw', () => {
  it('does nothing on the second click of a double-click', async () => {
    await withdrawButton().props.onClick!({ detail: 2 })
    expect(taken.paths).toEqual([])
  })

  it('still takes the note back on a click or a key', async () => {
    await withdrawButton().props.onClick!({ detail: 1 })
    await withdrawButton().props.onClick!({ detail: 0 })
    expect(taken.paths).toEqual(['dms/a_b/messages/m1', 'dms/a_b/messages/m1'])
  })
})
