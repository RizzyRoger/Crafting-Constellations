import { readFileSync } from 'node:fs'
import { createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { personAddress } from './personAddress'
import { CHOOSE, lastChoice, revealSheet, SHEET_FLOATS } from './sheetReveal'

describe('sheet reveal', () => {
  it('leaves the page alone where the sheet floats over the chart', () => {
    expect(revealSheet(true, false)).toBeNull()
    expect(revealSheet(true, true)).toBeNull()
  })

  it('scrolls a sheet that opened under the chart into view', () => {
    expect(revealSheet(false, false)).toEqual({ block: 'nearest', behavior: 'smooth' })
  })

  it('jumps instead of gliding when motion is reduced', () => {
    expect(revealSheet(false, true)).toEqual({ block: 'nearest', behavior: 'auto' })
  })

  it('uses the same width as the stylesheet that floats the sheet', () => {
    const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')
    const floating = css.match(/@media ([^{]+)\{\s*\.constellation \.person\.sheet\s*\{[^}]*position:\s*absolute/)
    expect(floating?.[1].trim()).toBe(SHEET_FLOATS)
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
