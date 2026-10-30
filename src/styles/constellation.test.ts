import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  body,
}))

// What every rule naming this selector gives the property, in the order it's declared
const values = (selector: string, property: string) =>
  rules
    .filter((rule) => rule.selectors.includes(selector))
    .flatMap(({ body }) =>
      body
        .split(';')
        .map((declaration) => declaration.split(':'))
        .filter(([name]) => name.trim() === property)
        .map(([, ...value]) => value.join(':').trim()),
    )

// Someone's note on their sheet can be one long word, such as hashtags run together. It set the sheet's
// column and the chart's with it: at 375px a 49-letter one scrolled the page sideways (448 against 375),
// and at 1280px it ran 90px out of the floating sheet
describe('a long word on the person sheet', () => {
  // anywhere, not break-word: only anywhere lets the column shrink below the word
  it.each(['.person > .note', '.person > .code'])('breaks rather than widening the sheet in %s', (selector) => {
    expect(values(selector, 'overflow-wrap')).toContain('anywhere')
  })

  // An auto column grows to its widest word; this one stays the width it's given
  it.each(['.person', '.constellation'])('cannot widen the column of %s', (selector) => {
    expect(values(selector, 'grid-template-columns')).toEqual(['minmax(0, 1fr)'])
  })
})
