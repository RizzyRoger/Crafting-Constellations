// The nine pigments of the source sheet, as used for avatars and swatches.
// Values come from CSS tokens (src/styles/tokens.css) so there is one source of truth.
import type { Stop } from './field'

export const PIGMENTS = [
  'paynesBlue',
  'graphite',
  'fresco',
  'paynes',
  'titanium',
  'caliente',
  'neutral',
  'cool',
  'warm',
] as const

export type Pigment = (typeof PIGMENTS)[number]

export const PIGMENT_NAMES: Record<Pigment, string> = {
  paynesBlue: 'Payne’s Blue Gray',
  graphite: 'Graphite Gray',
  fresco: 'Fresco Grey',
  paynes: 'Payne’s Gray',
  titanium: 'Grey Titanium',
  caliente: 'Caliente Gray',
  neutral: 'Neutral Gray',
  cool: 'Cool Gray',
  warm: 'Warm Gray',
}

const CSS_NAME: Record<Pigment, string> = {
  paynesBlue: 'paynes-blue',
  graphite: 'graphite',
  fresco: 'fresco',
  paynes: 'paynes',
  titanium: 'grey-titanium',
  caliente: 'caliente',
  neutral: 'neutral',
  cool: 'cool',
  warm: 'warm',
}

export const isPigment = (value: unknown): value is Pigment =>
  typeof value === 'string' && (PIGMENTS as readonly string[]).includes(value)

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export const pigmentVars = (pigment: Pigment) => {
  const n = CSS_NAME[pigment]
  return { d: `var(--${n}-dense)`, m: `var(--${n}-mid)`, t: `var(--${n}-tail)` }
}

export const pigmentStops = (pigment: Pigment): Stop[] => {
  const n = CSS_NAME[pigment]
  return [
    [1, cssVar(`--${n}-dense`)],
    [0.55, cssVar(`--${n}-mid`)],
    [0.22, cssVar(`--${n}-tail`)],
    [0, cssVar('--paper')],
  ]
}

// The commanding Payne's wash, sampled from the comp
export const paynesStops = (): Stop[] => [
  [1, '#15181f'],
  [0.86, cssVar('--wash-core')],
  [0.7, cssVar('--wash-entry')],
  [0.56, '#4a525d'],
  [0.46, cssVar('--wash-shoulder')],
  [0.36, cssVar('--wash-mid')],
  [0.26, cssVar('--wash-thin')],
  [0.15, cssVar('--wash-fade')],
  [0.06, cssVar('--wash-ghost')],
  [0, cssVar('--paper-warm')],
]
