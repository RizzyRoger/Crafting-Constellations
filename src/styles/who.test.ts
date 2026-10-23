import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  body,
}))
const declares = (selector: string, property: string, value: string) =>
  rules.some(
    (rule) =>
      rule.selectors.includes(selector) && new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*${value}\\s*(?:;|$)`).test(rule.body),
  )

// A pen name can be 32 letters with no space. At 375px, a licensed one in someone else's bubble
// was wider than the bubble, widened the chat's grid column, and the whole chat scrolled sideways
describe('a long pen name', () => {
  // overflow-wrap: break-word would keep the word's whole width as the name's smallest size, so the
  // chat column would still grow to fit it; anywhere lets it shrink and break
  it('breaks rather than pushing its row wider', () => {
    expect(declares('.who__name', 'overflow-wrap', 'anywhere')).toBe(true)
  })

  // Over the words there's no blot, so the licensed mark can drop under the name. A name that fits on
  // its own stays whole instead of breaking to keep the mark beside it
  it.each(['.bubble__box > .item__head > .who', '.comment-row__bar > .item__head > .who'])(
    'lets the licensed mark drop under it in %s',
    (selector) => {
      expect(declares(selector, 'flex-wrap', 'wrap')).toBe(true)
    },
  )
})
