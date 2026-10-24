import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Item } from './Item'

// Withdrawn writing drops out of the list at once, and anything said inside it goes too, so it
// says 'Withdrawn.' through the page's own status. No Firebase in node
const server = vi.hoisted(() => ({ refusal: null as string | null }))

vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/withdraw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/withdraw')>()),
  withdraw: async () => server.refusal,
}))

type Clickable = ReactElement<{ children?: ReactNode; onClick?: (e: { detail: number }) => unknown }>

const findButton = (node: ReactNode, label: string): Clickable | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => findButton(child, label)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  if (node.type === 'button' && node.props.children === label) return node as Clickable
  return findButton(node.props.children, label)
}

// My note as a bubble, with what it says through the page, read inside a render so its hooks run
const withdrawIn = (said: string[]) => {
  let tree = null as ReactNode
  const Probe = () => {
    tree = Item({
      item: { id: 'm1', path: 'dms/a_b/messages/m1', authorUid: 'me', status: 'published', createdAt: null },
      me: 'me',
      variant: 'bubble',
      children: null,
      say: (text) => said.push(text),
    })
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return findButton(tree, 'Withdraw')!.props.onClick!({ detail: 0 })
}

beforeEach(() => {
  server.refusal = null
})

describe('Withdraw, read aloud', () => {
  it('says “Withdrawn.” through the page once the server has it', async () => {
    const said: string[] = []
    await withdrawIn(said)
    expect(said).toEqual(['Withdrawn.'])
  })

  it('says nothing of the kind when the rules refuse it, since the writing is still there', async () => {
    server.refusal = 'You can’t do that here.'
    const said: string[] = []
    await withdrawIn(said)
    expect(said).toEqual([])
  })
})
