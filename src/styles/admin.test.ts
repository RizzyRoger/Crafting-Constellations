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

// Writing held for an off-list link names the whole address on its matched line. A Google Docs or
// Facebook address has no hyphen to break at, and at 375px Review scrolled sideways (540px wide)
describe('Review at phone width', () => {
  // break-word would keep the address's whole width as the line's smallest size, so the list's
  // column would still grow to fit it; anywhere lets it shrink and break
  it.each(['.admin-entry > .meta', '.admin-entry > .post__title'])('breaks a long address in a held entry’s %s', (selector) => {
    expect(declares(selector, 'overflow-wrap', 'anywhere')).toBe(true)
  })

  it('breaks a long address in a licence application’s statement', () => {
    expect(declares('.admin-dl dd', 'overflow-wrap', 'anywhere')).toBe(true)
  })
})
