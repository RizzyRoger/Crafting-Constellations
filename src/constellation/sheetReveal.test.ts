import { createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { personAddress } from './personAddress'
import { CHOOSE, focusOnClose, lastChoice, openerOf, revealSheet, sheetMayOpen } from './sheetReveal'

// At every width: from 1200px the sheet floats at the top of a chart or list that may be
// scrolled far past, so it needs bringing into view as much as one opening under the chart
describe('sheet reveal', () => {
  it('scrolls the sheet to the nearest edge, so one already in sight stays put', () => {
    expect(revealSheet(false)).toEqual({ block: 'nearest', behavior: 'smooth' })
  })

  it('jumps instead of gliding when motion is reduced', () => {
    expect(revealSheet(true)).toEqual({ block: 'nearest', behavior: 'auto' })
  })
})

// Stand-ins for elements: what's on the page, and the sheet holding some of them
const node = (name: string, isConnected = true) => ({ name, isConnected })
const body = node('body')
const star = node('star')
const name = node('name in the list')
const close = node('Close')
const sheet = { contains: (n: unknown) => n === close }

// Just enough of the chart's element: its tabindex attribute, whether it has focus, its listeners
const chart = () => {
  const seen = { tabindex: false, focused: false, listening: 0 }
  const listeners = new Map<string, () => void>()
  const el = {
    set tabIndex(_: number) {
      seen.tabindex = true
    },
    removeAttribute: () => {
      seen.tabindex = false
    },
    focus: () => {
      seen.focused = seen.tabindex
    },
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, listener)
      seen.listening = listeners.size
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
      seen.listening = listeners.size
    },
  }
  return { el: el as unknown as HTMLElement, seen, fire: (type: string) => listeners.get(type)?.() }
}

describe('giving focus back when the sheet closes', () => {
  it('notes the star that had focus as the sheet came up', () => {
    expect(openerOf(null, star, { body, sheet })).toBe(star)
  })

  it('keeps the last one when focus is nowhere or already in the sheet', () => {
    // The rail search's result unmounts as it chooses, leaving focus on the body
    expect(openerOf(star, body, { body, sheet })).toBe(star)
    expect(openerOf(star, null, { body, sheet })).toBe(star)
    expect(openerOf(star, close, { body, sheet })).toBe(star)
    expect(openerOf(null, body, { body, sheet })).toBeNull()
  })

  it('follows a second choice of the same person from somewhere else', () => {
    expect(openerOf(star, name, { body, sheet })).toBe(name)
  })

  it('goes back to what chose them while it’s on the page, leaving the chart as it was', () => {
    let focused = false
    const opener = {
      ...star,
      focus: () => {
        focused = true
      },
    }
    const here = chart()
    focusOnClose(opener, here.el)?.focus()
    expect(focused).toBe(true)
    expect(here.seen).toEqual({ tabindex: false, focused: false, listening: 0 })
  })

  it('goes to the chart when that has gone, for that move only, so a later click on its text keeps Tab there', () => {
    for (const opener of [{ ...node('star of a view switched away', false), focus: () => {} }, null]) {
      const here = chart()
      focusOnClose(opener, here.el)?.focus()
      expect(here.seen).toEqual({ tabindex: true, focused: true, listening: 2 })
      here.fire('pointerdown')
      expect(here.seen).toEqual({ tabindex: false, focused: true, listening: 0 })
    }
  })
})

describe('holding the sheet back until the chart has its height', () => {
  const page = (view: string, chartLaidOut = false, loading = false) => ({ loading, view, chartLaidOut })

  it('waits for the groups chart to be laid out, so the sheet comes up where it will stay', () => {
    expect(sheetMayOpen(false, page('groups'))).toBe(false)
    expect(sheetMayOpen(false, page('groups', true))).toBe(true)
  })

  it('doesn’t wait on the friends chart, which holds its room, or the list', () => {
    expect(sheetMayOpen(false, page('friends'))).toBe(true)
    expect(sheetMayOpen(false, page('list'))).toBe(true)
    expect(sheetMayOpen(false, page('friends', false, true))).toBe(false)
  })

  it('keeps an open sheet up when switching to a groups chart not laid out yet', () => {
    expect(sheetMayOpen(true, page('groups'))).toBe(true)
  })
})

describe('choosing someone again', () => {
  it('counts a navigation marked as a choice, and keeps the last one through any other', () => {
    expect(lastChoice('k1', { key: 'k2', state: CHOOSE })).toBe('k2')
    expect(lastChoice('k1', { key: 'k2', state: null })).toBe('k1')
    expect(lastChoice('k1', { key: 'k2', state: { left: true } })).toBe('k1')
    expect(lastChoice('k1', { key: 'k2', state: 'reveal' })).toBe('k1')
  })

  it('reveals the open sheet again when the search chooses whoever is open, but not on a view switch', async () => {
    const router = createMemoryRouter([{ path: '*', element: null }], { initialEntries: ['/constellation?view=groups&person=heron'] })
    const here = () => router.state.location
    let chosenAt = here().key

    // The rail search picks Heron, whose sheet is open: the same address, still a new choice
    const to = personAddress(here(), 'heron')
    expect(to).toBe('/constellation?view=groups&person=heron')
    await router.navigate(to, { replace: to === here().pathname + here().search, state: CHOOSE })
    expect(here().pathname + here().search).toBe('/constellation?view=groups&person=heron')
    expect(lastChoice(chosenAt, here())).not.toBe(chosenAt)
    chosenAt = lastChoice(chosenAt, here())

    // Switching views moves the address but chooses no one, so the page stays where it is
    await router.navigate('/constellation?view=list&person=heron', { replace: true })
    expect(lastChoice(chosenAt, here())).toBe(chosenAt)
  })
})
