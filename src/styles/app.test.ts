import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const parse = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))
const rules = parse(read('./app.css'))
const paper = parse(read('./paper.css'))
const sheets = { 'app.css': rules, 'paper.css': paper }

// What every rule naming this selector gives the property, in the order it's declared
const values = (from: typeof rules, selector: string, property: string) =>
  from
    .filter((rule) => rule.selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).includes(selector))
    .flatMap(({ body }) =>
      body
        .split(';')
        .map((declaration) => declaration.split(':'))
        .filter(([name]) => name.trim() === property)
        .map(([, ...value]) => value.join(':').trim()),
    )

describe('app.css', () => {
  // A seen notice still carries a moderator's note and its time in --meta-readable, which only
  // just clears 4.5:1 on paper (4.84:1); at 0.8 opacity it fell to 3.29:1
  it('never fades a notice row', () => {
    const faded = rules.filter(({ selector, body }) => {
      const opacity = body.match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/)
      return selector.includes('.notice') && opacity !== null && Number(opacity[1]) < 1
    })
    expect(faded.map(({ selector }) => selector)).toEqual([])
  })
})

// One long word (a moderator's note with a Docs link, an underscore-joined file name, a 30-letter pen
// name) set a grid column's smallest width, and the page or the rail scrolled sideways. anywhere, not
// break-word: only anywhere lets the column shrink below the word
describe('a long word', () => {
  it.each([
    '.banner .note',
    '.field .hint',
    '.error',
    '.notice .meta',
    '.disc__list a',
    '.disc__list button',
  ])('breaks rather than widening its column in %s', (selector) => {
    expect(values(rules, selector, 'overflow-wrap')).toContain('anywhere')
  })
})

// The wash fades to paper over its last 20%, and its 40px right padding keeps the label out of that.
// A quiet button's 10px replaced it, so 'Count my visits' ended at 92% of the button, about 1.7:1
describe('a quiet wash button', () => {
  it('keeps its label clear of the fade', () => {
    const [top, right = top, , left = right] = values(rules, '.act--quiet', 'padding')[0].split(/\s+/)
    const fade = values(rules, '.act--quiet.act--wash', 'padding-right').at(-1) ?? right
    // 'Count my visits' and 'Approve licence', the longest, are about 104px of Kalam at 16px
    const label = 104
    const end = Number.parseFloat(left) + label
    expect(end / (end + Number.parseFloat(fade))).toBeLessThanOrEqual(0.8)
  })
})

// On phones 100vh is the height with the browser's toolbars hidden. While they show, the bottom of a
// 100vh shell (private notes' send bar) sat under Safari's bar or below Chrome's screen
describe('the shell on a phone', () => {
  it.each([
    ['app.css', '.shell', 'height'],
    ['app.css', '.shell', 'min-height'],
    ['paper.css', 'body', 'min-height'],
  ] as const)('fits the visible height, with 100vh where dvh is missing: %s %s %s', (file, selector, property) => {
    expect(values(sheets[file], selector, property)).toEqual(['100vh', '100dvh'])
  })
})

// A send bar's placeholder is its only visible label, as is a moderator's note field's. Browsers draw
// placeholders lighter than 4.5:1 on paper (Chrome 4.16:1, Safari 2.1:1), and Firefox at 0.54 opacity
describe('placeholders', () => {
  it('are all drawn in the readable meta colour at full strength', () => {
    expect(values(paper, '::placeholder', 'color')).toEqual(['var(--meta-readable)'])
    expect(values(paper, '::placeholder', 'opacity')).toEqual(['1'])
  })
})
