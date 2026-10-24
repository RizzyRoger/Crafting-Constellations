import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))

describe('the chat scroller', () => {
  // My bubbles carry a visually hidden 'You' (position: absolute). Unless the chat is positioned,
  // those labels hang off the next positioned scroller out (.pane or .shell__main) at their
  // unscrolled places, and stretch it by the whole history's height
  it('is positioned, so hidden labels in it scroll and clip with it', () => {
    const chat = rules.filter(({ selector }) => selector === '.chat')
    expect(chat).toHaveLength(1)
    expect(chat[0].body).toMatch(/(?:^|;)\s*position\s*:\s*relative\s*;/)
  })
})
