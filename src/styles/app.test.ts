import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))

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
