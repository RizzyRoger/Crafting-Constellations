import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'

// A server render can't type or wait on a send, so Composer runs on a small stand-in for
// React's hooks: each state keeps its slot from one render to the next, setters write to
// it, and layout effects run once a render is done
const hooks = vi.hoisted(() => {
  type Slot = { state?: unknown; set?: (next: unknown) => void; ref?: { current: unknown } }
  let slots: Slot[] = []
  let at = 0
  let effects: (() => void)[] = []
  const slot = () => (slots[at++] ??= {})
  return {
    mount: () => {
      slots = []
    },
    render: <T>(component: () => T): T => {
      at = 0
      effects = []
      const out = component()
      effects.forEach((effect) => effect())
      return out
    },
    useState: (initial: unknown) => {
      const s = slot()
      if (!s.set) {
        s.state = initial
        s.set = (next) => {
          s.state = typeof next === 'function' ? (next as (last: unknown) => unknown)(s.state) : next
        }
      }
      return [s.state, s.set]
    },
    useMemo: (make: () => unknown) => make(),
    useRef: (initial: unknown) => {
      const s = slot()
      s.ref ??= { current: initial }
      return s.ref
    },
    useId: () => 'c',
    useLayoutEffect: (effect: () => void) => {
      effects.push(effect)
    },
  }
})
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const { useState, useMemo, useRef, useId, useLayoutEffect } = hooks
  return { ...react, useState, useMemo, useRef, useId, useLayoutEffect }
})
// No Firebase in node
vi.mock('../lib/callables', () => ({ describeError: (e: Error) => e.message }))

type Props = Parameters<typeof Composer>[0]
type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const find = (node: ReactNode, type: string): El | null => {
  if (Array.isArray(node)) return node.reduce<El | null>((hit, n) => hit ?? find(n, type), null)
  if (!node || typeof node !== 'object' || !('props' in node)) return null
  const el = node as El
  return el.type === type ? el : find(el.props.children, type)
}

const BEA = { id: 'bea', penName: 'Bea', avatarSeed: 'bea', pigment: 'ochre' }
const BEA_LIN = { id: 'bea-lin', penName: 'Bea Lin', avatarSeed: 'bea-lin', pigment: 'ochre' }

const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))
// Crisis language, from functions' moderation tests
const CRISIS = rot13('v jnag gb qvr')

// One composer on a page, with a send that waits for the server until the case says it answered
const open = (props: Partial<Props> = {}) => {
  const sent: Parameters<Props['onSubmit']>[] = []
  let reply: (refusal?: Error) => void = () => {}
  const onSubmit: Props['onSubmit'] = (...args) => {
    sent.push(args)
    return new Promise((resolve, reject) => {
      reply = (refusal) => (refusal ? reject(refusal) : resolve())
    })
  }
  hooks.mount()
  const tree = () => hooks.render(() => Composer({ label: 'Message', submitLabel: 'Send', shape: 'bar', rows: 1, onSubmit, ...props }) as El)
  const field = (type: string) => find(tree(), type)!.props
  // Each event lands on the latest render, and React renders again once it is handled
  const on = (type: string, name: string) => (event: unknown) => {
    const handle = field(type)[name] as (e: unknown) => void
    handle(event)
    tree()
  }
  // A server render attaches no refs, so the field and Send get stand-in nodes, and the page notes
  // which of them has focus, starting on `at`
  const focusOn = (at: 'field' | 'Send') => {
    const page = { activeElement: null as unknown }
    const node = (name: string) => {
      const self = { name, focus: () => void (page.activeElement = self), setSelectionRange: () => {} }
      return self
    }
    const nodes = { field: node('field'), Send: node('Send') }
    const attachField = field('textarea').ref as (node: unknown) => void
    attachField(nodes.field)
    const send = field('button').ref as { current: unknown } | undefined
    if (send) send.current = nodes.Send
    page.activeElement = nodes[at]
    vi.stubGlobal('document', page)
    return { focused: () => (page.activeElement as { name: string }).name }
  }
  const key = (key: string, mods: { ctrlKey?: boolean } = {}) =>
    on('textarea', 'onKeyDown')({
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...mods,
      nativeEvent: { isComposing: false, keyCode: key === 'Enter' ? 13 : 0 },
      preventDefault: () => {},
      stopPropagation: () => {},
    })
  return {
    sent,
    html: () => renderToStaticMarkup(tree()),
    text: () => field('textarea').value,
    title: () => find(tree(), 'input')?.props.value,
    button: () => field('button'),
    type: (value: string) => on('textarea', 'onChange')({ target: { value, selectionStart: value.length } }),
    typeTitle: (value: string) => on('input', 'onChange')({ target: { value } }),
    focus: () => on('textarea', 'onFocus')({}),
    focusOn,
    key,
    // Ctrl+Enter, so the caret stays in the field
    send: () => key('Enter', { ctrlKey: true }),
    post: () => on('form', 'onSubmit')({ preventDefault: () => {} }),
    // The server answers, or refuses the write
    answer: async (refusal?: Error) => {
      reply(refusal)
      await new Promise((resolve) => setTimeout(resolve, 0))
      tree()
    },
  }
}

describe('Composer while a message is on its way', () => {
  it('keeps what was typed meanwhile when the server answers: that is the next message', async () => {
    const composer = open()
    composer.type('first message')
    composer.send()
    expect(composer.button().children).toBe('Sending…')
    composer.type('second draft')
    await composer.answer()
    expect(composer.text()).toBe('second draft')
    expect(composer.sent.map(([text]) => text)).toEqual(['first message'])
    expect(composer.button()).toMatchObject({ children: 'Send', disabled: false })
  })

  it('clears the field once the server has it, if nothing more was typed', async () => {
    const composer = open()
    composer.type('first message')
    composer.send()
    await composer.answer()
    expect(composer.text()).toBe('')
  })

  it('keeps the people picked for the next message, so they are still pinged', async () => {
    const composer = open({ people: [BEA] })
    composer.type('first message')
    composer.send()
    composer.type('@Be')
    composer.key('Enter')
    composer.type('@Bea are you about tonight?')
    await composer.answer()
    composer.send()
    expect(composer.sent.at(-1)).toEqual(['@Bea are you about tonight?', undefined, ['bea']])
  })

  it('keeps a title changed meanwhile, with its sheet open, and clears the words that went', async () => {
    const composer = open({ shape: undefined, expandable: true, withTitle: true })
    composer.focus()
    composer.typeTitle('A good day')
    composer.type('first post')
    composer.post()
    composer.typeTitle('A better day')
    await composer.answer()
    expect(composer.sent.map(([text, title]) => [text, title])).toEqual([['first post', 'A good day']])
    expect(composer.title()).toBe('A better day')
    expect(composer.text()).toBe('')
  })

  it('takes off the words that went and keeps what was typed after them, so they are not sent twice', async () => {
    const composer = open()
    composer.type('first message')
    composer.send()
    composer.type('first message second')
    await composer.answer()
    expect(composer.text()).toBe('second')
    composer.send()
    await composer.answer()
    expect(composer.sent.map(([text]) => text)).toEqual(['first message', 'second'])
    expect(composer.text()).toBe('')
  })

  it('keeps the field as it is if the words that went were changed meanwhile', async () => {
    const composer = open()
    composer.type('See you at 6')
    composer.send()
    composer.type('See you at 7 instead')
    await composer.answer()
    expect(composer.text()).toBe('See you at 7 instead')
  })

  it('lets go of the people picked for the words that went, so the next words don\'t ping them', async () => {
    const composer = open({ people: [BEA] })
    composer.type('@Be')
    composer.key('Enter')
    composer.type('@Bea are you about tonight?')
    composer.send()
    composer.type('@Bea are you about tonight? I can drive')
    await composer.answer()
    expect(composer.text()).toBe('I can drive')
    // Typed by hand, not picked
    composer.type('I can drive @Bea')
    composer.send()
    expect(composer.sent.map(([text, , mentions]) => [text, mentions])).toEqual([
      ['@Bea are you about tonight?', ['bea']],
      ['I can drive @Bea', []],
    ])
  })

  it('keeps the list closed on a name picked after the words that went', async () => {
    const composer = open({ people: [BEA, BEA_LIN] })
    composer.type('first message')
    composer.send()
    composer.type('first message @Be')
    composer.key('Enter')
    await composer.answer()
    expect(composer.text()).toBe('@Bea ')
    expect(composer.html()).not.toContain('mention-list')
  })

  it('keeps the sheet open with the words typed after a post, and clears its title', async () => {
    const composer = open({ shape: undefined, expandable: true, withTitle: true })
    composer.focus()
    composer.typeTitle('A good day')
    composer.type('first post')
    composer.post()
    composer.type('first post\n\nand a second thought')
    await composer.answer()
    expect(composer.text()).toBe('and a second thought')
    expect(composer.title()).toBe('')
  })

  it('clears the title and closes the sheet once the post is in, if nothing more was typed', async () => {
    const composer = open({ shape: undefined, expandable: true, withTitle: true })
    composer.focus()
    composer.typeTitle('A good day')
    composer.type('first post')
    composer.post()
    await composer.answer()
    expect(composer.title()).toBeUndefined()
    composer.focus()
    expect(composer.title()).toBe('')
  })
})

// What each "may wait" note holds
const hints = (html: string) => [...html.matchAll(/<p class="hint live" aria-live="polite">(.*?)<\/p>/g)].map((m) => m[1])
const WAIT = 'This may wait for a person to read it before others see it.'

// Talk and private notes aren't live (they'd read out their history), so the composer says
// its own news
describe('Composer, read aloud', () => {
  it('holds its "may wait" note in place and empty before anything is typed', () => {
    for (const shape of [{ shape: 'bar' as const }, { shape: undefined, expandable: true }]) {
      expect(hints(open(shape).html())).toEqual([''])
    }
  })

  it('says in that same place when a person may read it first', () => {
    const composer = open()
    composer.type('have a look at https://example.com/x')
    expect(hints(composer.html())).toEqual([WAIT])
    composer.type('have a look')
    expect(hints(composer.html())).toEqual([''])
  })

  // The server holds private crisis writing for a person when anything else was flagged too
  it('says a private note may wait when crisis language is not all that was flagged', () => {
    const composer = open({ context: 'private' })
    composer.type(CRISIS)
    expect(hints(composer.html())).toEqual([''])
    composer.type(`${CRISIS} https://example.com/fundraiser`)
    expect(hints(composer.html())).toEqual([WAIT])
    composer.type(`${CRISIS} ${'\u{1F62D}'.repeat(20)}`)
    expect(hints(composer.html())).toEqual([WAIT])
  })

  it('says crisis writing in a group may wait', () => {
    const composer = open()
    composer.type(CRISIS)
    expect(hints(composer.html())).toEqual([WAIT])
  })

  it('reads out a refused send as an alert, and keeps the words', async () => {
    const composer = open()
    composer.type('are you there?')
    composer.send()
    await composer.answer(new Error('This conversation is closed.'))
    expect(composer.html()).toMatch(/<p class="error" role="alert">This conversation is closed\.<\/p>/)
    expect(composer.text()).toBe('are you there?')
  })
})

// Enter in the field starts a new line, so a keyboard user sends with Tab to Send, then Enter
describe('Composer, sent with the Send button', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hands focus to the field: Send is disabled while the words are on their way and once they have gone', async () => {
    const composer = open()
    composer.type('see you at six')
    const page = composer.focusOn('Send')
    composer.post()
    expect(composer.button()).toMatchObject({ children: 'Sending…', disabled: true })
    expect(page.focused()).toBe('field')
    await composer.answer()
    expect(composer.button().disabled).toBe(true)
    expect(page.focused()).toBe('field')
  })

  it('leaves focus in the field when the words go with Ctrl+Enter', async () => {
    const composer = open()
    composer.type('see you at six')
    const page = composer.focusOn('field')
    composer.send()
    await composer.answer()
    expect(page.focused()).toBe('field')
  })
})
