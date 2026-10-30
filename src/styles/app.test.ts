import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONSENT_ROOM } from '../lib/consentRoom'

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

// Each rule with the @media conditions around it, in the order they're declared
const withMedia = (css: string) => {
  const found: { selector: string; body: string; media: string[] }[] = []
  const open: string[] = []
  let from = 0
  let leaf = false
  for (const { 0: brace, index } of css.matchAll(/[{}]/g)) {
    const text = css.slice(from, index)
    from = index + 1
    if (brace === '{') {
      open.push(text.trim())
      leaf = true
    } else {
      const prelude = open.pop() ?? ''
      if (leaf) found.push({ selector: prelude, body: text, media: open.filter((at) => at.startsWith('@media')) })
      leaf = false
    }
  }
  return found
}

// Both sheets as the page loads them, paper first
const cascade = withMedia(read('./paper.css') + read('./app.css'))

type Screen = { width: number; pointer: 'coarse' | 'fine' }

// Whether a screen meets one (min-width, max-width, pointer) condition of an @media query
const feature = (screen: Screen, name: string, value: string) => {
  if (name === 'max-width') return screen.width <= Number.parseFloat(value)
  if (name === 'min-width') return screen.width >= Number.parseFloat(value)
  return name === 'pointer' && value === screen.pointer
}

// The rules a screen sees, in order: those outside @media, and those whose conditions it meets
const seenBy = (screen: Screen) =>
  cascade.filter(({ media }) =>
    media.every((query) =>
      query
        .replace(/^@media/, '')
        .split(',')
        .some((one) => [...one.matchAll(/\(\s*([\w-]+)\s*:\s*([^)]*?)\s*\)/g)].every(([, name, value]) => feature(screen, name, value))),
    ),
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

// Cancel in Report, Block on a person, Make moderator in Review: link buttons wait while what was
// pressed beside them goes through, and looked as live as ever while clicks did nothing
describe('a disabled link button', () => {
  it('dims and stops showing a pointer, as a disabled .act does', () => {
    expect(values(rules, '.link-btn[disabled]', 'opacity')).toEqual(values(rules, '.act[disabled]', 'opacity'))
    expect(values(rules, '.link-btn[disabled]', 'cursor')).toEqual(['not-allowed'])
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

// A send bar's field has a basis of 0, so a 'may wait' note or a refusal short enough to fit beside
// Send shared the field's line and squeezed it to a sliver, the unsent words with it (6px at 414px)
describe('a send bar', () => {
  it.each(['.composer--bar > .hint', '.composer--bar > .error'])('gives %s a line of its own under the field', (selector) => {
    const [grow, shrink, basis] = (values(rules, selector, 'flex').at(-1) ?? '').split(/\s+/)
    expect({ grow, shrink, basis }).toEqual({ grow: '1', shrink: '0', basis: '100%' })
  })
})

// The counting-consent slip is fixed over the foot of every page, and nothing left room for it: on
// a phone, Sign in, Google and the send bar sat under it with no way to scroll them clear
describe('the consent slip', () => {
  const room = `var(${CONSENT_ROOM}, 0px)`
  // The last bottom padding a screen gives the selector: padding-bottom, or the bottom of a padding
  // shorthand, keeping calc() and var() whole
  const paddingBottom = (width: number, selector: string) =>
    seenBy({ width, pointer: 'fine' })
      .filter((rule) => rule.selector.split(',').map((s) => s.trim()).includes(selector))
      .flatMap(({ body }) => [...body.matchAll(/(?:^|;)\s*(padding|padding-bottom)\s*:\s*([^;]+)/g)])
      .map(([, name, value]) => {
        if (name === 'padding-bottom') return value.trim()
        const [top, , end = top] = value.match(/(?:[^\s(]+|\((?:[^()]|\([^()]*\))*\))+/g) ?? []
        return end
      })
      .at(-1)

  // The pages that scroll the window, and the shell where it is one column (a phone, a tablet)
  it.each([
    ['.auth', 375],
    ['.auth', 1280],
    ['.landing', 375],
    ['.landing', 1280],
    ['.shell__main', 375],
    ['.shell__main', 900],
  ])('leaves room for it at the foot of %s at %ipx', (selector, width) => {
    expect(paddingBottom(width, selector)).toContain(room)
  })

  it.each(['html', '.shell__main'])('keeps focus in %s scrolled clear of it', (selector) => {
    expect(values(seenBy({ width: 375, pointer: 'coarse' }), selector, 'scroll-padding-bottom').at(-1)).toBe(room)
  })
})

// iPhone Safari zooms the page into a text field under 16px as it takes focus, and stays zoomed with
// the right edge off-screen. The rail's search (15px) and a moderator's note (13px) did
describe('a text field on a touch screen', () => {
  const subject = (selector: string) => selector.split(/[\s>+~]+/).at(-1) ?? ''
  // Styled by element (input, textarea, select), or by a class set straight on the field
  const fields = [
    ...new Set(
      cascade
        .filter(({ body }) => /font-size\s*:/.test(body))
        .flatMap(({ selector }) => selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ')))
        .filter((selector) => /^(?:input|textarea|select)(?![\w-])/.test(subject(selector))),
    ),
    '.disc__search',
    '.admin-note',
  ]

  it.each([375, 932])('is drawn at 16px or more %ipx wide', (width) => {
    const seen = seenBy({ width, pointer: 'coarse' })
    const small = fields.filter((field) => !(Number.parseFloat(values(seen, field, 'font-size').at(-1) ?? '') >= 16))
    // The fields styled by element were found too, not only the two classes
    expect(fields.length).toBeGreaterThan(2)
    expect(small).toEqual([])
  })
})
