import { createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { personAddress } from './personAddress'
import { CHOOSE, focusOnClose, lastChoice, openerOf, revealSheet } from './sheetReveal'

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

  it('goes back to what chose them, or to the chart when that has gone', () => {
    const chart = node('chart')
    expect(focusOnClose(star, chart)).toBe(star)
    expect(focusOnClose(node('star of a view switched away', false), chart)).toBe(chart)
    expect(focusOnClose(null, chart)).toBe(chart)
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
