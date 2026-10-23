import { describe, expect, it } from 'vitest'
import { penNameSearchTerm } from './penNameSearch'

// penNameLower as saveProfile stores it, for the names "Mary's Lantern" and "O'Neil"
const MARY = "mary's lantern"
const ONEIL = "o'neil"

// Search is a range from the term to the term and , so it finds the names it starts
const finds = (typed: string, stored: string) => {
  const term = penNameSearchTerm(typed)
  return stored >= term && stored <= `${term}`
}

describe('penNameSearchTerm', () => {
  it('finds a name typed with a phone’s curly apostrophe', () => {
    expect(finds('Mary’s', MARY)).toBe(true)
    expect(finds('O’Neil', ONEIL)).toBe(true)
  })

  it('finds a name with a doubled space between its words', () => {
    expect(finds('Mary’s  Lan', MARY)).toBe(true)
  })

  it('finds a name typed in full-width letters', () => {
    expect(finds('Ｍａｒｙ', MARY)).toBe(true)
  })

  it('leaves plain typing as it was: trimmed and lowercased', () => {
    expect(penNameSearchTerm('  Mary ')).toBe('mary')
    expect(penNameSearchTerm('')).toBe('')
  })
})
