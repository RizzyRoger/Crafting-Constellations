import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Rule {
  media: string | null
  selectors: string[]
  props: Map<string, string>
  // Every declaration in order, a fallback (100vh before 100dvh) included
  declared: (readonly [string, string])[]
}

// Each rule in file order, with the @media (or other at-rule) it sits in
const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules: Rule[] = []
let media: string | null = null
let open: Omit<Rule, 'props' | 'declared'> | null = null
for (const [, text, brace] of css.matchAll(/([^{}]*)([{}])/g)) {
  if (brace === '{' && text.trim().startsWith('@')) media = text.trim()
  else if (brace === '{') open = { media, selectors: text.split(',').map((s) => s.trim().replace(/\s+/g, ' ')) }
  else if (open) {
    const props = text
      .split(';')
      .map((declaration) => declaration.split(':'))
      .filter(([property]) => property.trim())
      .map(([property, ...value]) => [property.trim(), value.join(':').trim()] as const)
    rules.push({ ...open, props: new Map(props), declared: props })
    open = null
  } else media = null
}

const PHONE = '@media (max-width: 900px)'
const phone = (selector: string) => rules.find((rule) => rule.media === PHONE && rule.selectors.includes(selector))
const base = (selector: string) => rules.find((rule) => rule.media === null && rule.selectors.includes(selector))

describe('the rail on a phone', () => {
  // It is capped at 38vh. With overflow hidden and the foot pinned, the three lists got what the foot
  // left: 14px at 375x667, none in landscape, and an unconfirmed moderator lost Sign out as well
  it('scrolls as a whole', () => {
    expect(phone('.rail')?.props.get('max-height')).toBe('38vh')
    expect(phone('.rail')?.props.get('overflow')).toBe('auto')
  })

  it('keeps the lists at their own height rather than squeezing them', () => {
    expect(phone('.rail__browse')?.props.get('flex')).toBe('none')
  })

  // The base .rail__browse and .rail__foot rules came after this block, so they won and its tighter
  // foot never applied
  it('is not undone by a later rule for every width', () => {
    const undone = rules.flatMap((rule, i) => {
      if (rule.media !== PHONE) return []
      const later = rules.slice(i + 1).filter((other) => other.media === null)
      return rule.selectors.flatMap((selector) =>
        later
          .filter((other) => other.selectors.includes(selector))
          .flatMap((other) => [...rule.props.keys()].filter((p) => other.props.has(p)).map((p) => `${selector} ${p}`)),
      )
    })
    expect(undone).toEqual([])
  })
})

describe('the rail on a desktop', () => {
  // With only a min-height it took its lists' height: with a few chats and groups open it ran past a
  // 640px window, its lists never scrolled, Sign out went off-screen and the whole window scrolled
  it('is as tall as the shell, so its lists scroll and the foot stays in view', () => {
    const heights = base('.rail')?.declared.filter(([property]) => property === 'height').map(([, value]) => value)
    expect(heights).toEqual(['100vh', '100dvh'])
    expect(base('.rail')?.props.get('min-height')).toBeUndefined()
  })

  // Otherwise a phone rail with its lists closed would stand at its 38vh cap with nothing in it
  it('leaves a phone rail its own height under the cap', () => {
    expect(phone('.rail')?.props.get('height')).toBe('auto')
  })
})
