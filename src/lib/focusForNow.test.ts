import { describe, expect, it } from 'vitest'
import { focusForNow, pageStart } from './focusForNow'

// Just enough of an element: its tabindex attribute, whether it has focus, and its listeners
const element = () => {
  const attributes = new Map<string, string>()
  const listeners = new Map<string, Set<() => void>>()
  let focused = false
  let options: FocusOptions | undefined
  const el = {
    set tabIndex(value: number) {
      attributes.set('tabindex', String(value))
    },
    removeAttribute: (name: string) => attributes.delete(name),
    focus: (given?: FocusOptions) => {
      focused = attributes.has('tabindex')
      options = given
    },
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
  }
  return {
    el: el as unknown as HTMLElement,
    focused: () => focused,
    options: () => options,
    focusable: () => attributes.has('tabindex'),
    listening: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    fire: (type: string) => [...(listeners.get(type) ?? [])].forEach((listener) => listener()),
  }
}

describe('focusForNow', () => {
  it('takes focus to an element that isn’t focusable', () => {
    const page = element()
    focusForNow(page.el)
    expect(page.focused()).toBe(true)
  })

  it('stops it being focusable once focus moves on, so a later click on its text doesn’t focus it', () => {
    const page = element()
    focusForNow(page.el)
    page.fire('blur')
    expect(page.focusable()).toBe(false)
    expect(page.listening()).toBe(0)
  })

  it('stops it being focusable at the next click, too, so the click lands where it was made', () => {
    const page = element()
    focusForNow(page.el)
    expect(page.focusable()).toBe(true)
    page.fire('pointerdown')
    expect(page.focusable()).toBe(false)
    expect(page.listening()).toBe(0)
  })

  it('passes on how to focus, so a region much taller than the screen can take focus without scrolling', () => {
    const list = element()
    focusForNow(list.el, { preventScroll: true })
    expect(list.focused()).toBe(true)
    expect(list.options()).toEqual({ preventScroll: true })
  })
})

describe('pageStart', () => {
  const page = (ids: string[], headings: string[]) =>
    ({
      getElementById: (id: string) => (ids.includes(id) ? { id } : null),
      querySelector: (selector: string) => (headings.includes(selector) ? { tag: selector } : null),
    }) as unknown as Document

  it('is the shell’s main on a page inside the shell', () => {
    expect(pageStart(page(['main'], ['h1']))).toEqual({ id: 'main' })
  })

  it('is the page’s heading where there’s no shell, as on the landing page or signing in', () => {
    expect(pageStart(page([], ['h1']))).toEqual({ tag: 'h1' })
  })

  it('is nothing on a page with neither', () => {
    expect(pageStart(page([], []))).toBeNull()
  })
})
