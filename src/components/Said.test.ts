import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Said, useSaid, type Saying } from './Said'

// A server render keeps no state between renders, so the hook runs on a small stand-in for
// useState: each state keeps its slot from one render to the next, and setters write to it
const hooks = vi.hoisted(() => {
  let slots: { state: unknown }[] = []
  let at = 0
  return {
    mount: () => {
      slots = []
    },
    render: <T>(hook: () => T): T => {
      at = 0
      return hook()
    },
    useState: (initial: unknown) => {
      const slot = (slots[at++] ??= { state: initial })
      const set = (next: unknown) => {
        slot.state = typeof next === 'function' ? (next as (last: unknown) => unknown)(slot.state) : next
      }
      return [slot.state, set]
    },
  }
})
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), useState: hooks.useState }))

// One page with its status, open on a place
const page = () => {
  hooks.mount()
  return (place: string) => hooks.render(() => useSaid(place))
}

const region = (said: Saying | null) => renderToStaticMarkup(createElement(Said, { said }))

describe('Said', () => {
  it('holds its region in place and empty before anything is said, so what lands later is heard', () => {
    const talk = page()
    const [said] = talk('groups/g/messages')
    expect(region(said)).toBe('<p class="visually-hidden" role="status"></p>')
  })

  it('says the words in it once they land', () => {
    const talk = page()
    const [, say] = talk('groups/g/messages')
    say('Withdrawn.')
    const [said] = talk('groups/g/messages')
    expect(region(said)).toBe('<p class="visually-hidden" role="status"><span>Withdrawn.</span></p>')
  })

  it('says the same words again in a new node, so a second withdrawal is heard too', () => {
    const talk = page()
    const [, say] = talk('groups/g/messages')
    say('Withdrawn.')
    const [first] = talk('groups/g/messages')
    say('Withdrawn.')
    const [second] = talk('groups/g/messages')
    expect(second?.text).toBe(first?.text)
    expect(second?.key).not.toBe(first?.key)
  })

  // Moving from one group to another keeps the page, and its talk, mounted
  it('starts with nothing said when another place opens in the same page, and on coming back', () => {
    const talk = page()
    const [, say] = talk('groups/a/messages')
    say('Withdrawn.')
    expect(talk('groups/b/messages')[0]).toBeNull()
    expect(talk('groups/a/messages')[0]).toBeNull()
  })

  it('doesn’t say what lands late for the last place in the one open now', () => {
    const talk = page()
    const [, sayInA] = talk('groups/a/messages')
    talk('groups/b/messages')
    sayInA('Withdrawn.')
    expect(talk('groups/b/messages')[0]).toBeNull()
  })
})
