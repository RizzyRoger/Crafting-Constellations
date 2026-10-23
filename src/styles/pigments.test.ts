import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [read('./paper.css'), read('./app.css')].flatMap((css) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selectors: selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
    body,
  })),
)
const outlined = (selector: string) =>
  rules.some((rule) => rule.selectors.includes(selector) && /(?:^|;)\s*outline\s*:\s*2px solid var\(--ink\)\s*(?:;|$)/.test(rule.body))

// The pigment radio is hidden (opacity 0), so its own focus ring can't be seen. The ring was drawn on
// the swatch beside it, but the swatch's mask (its wet edge) clips anything outside it, ring included
describe('the pigment picker', () => {
  it('draws no focus ring on a swatch, where its mask would clip it', () => {
    const onSwatch = rules.flatMap((rule) =>
      rule.selectors.filter((s) => /:focus/.test(s) && /\.swatch$/.test(s) && /(?:^|;)\s*outline\s*:/.test(rule.body)),
    )
    expect(onSwatch).toEqual([])
  })

  it('rings the focused pigment’s label', () => {
    expect(outlined('.pigments label:has(input:focus-visible)')).toBe(true)
  })

  // Older browsers without :has() ring the pigment's name instead
  it('rings the name where :has() is missing', () => {
    expect(outlined('.pigments input:focus-visible + .swatch + .code')).toBe(true)
  })
})
