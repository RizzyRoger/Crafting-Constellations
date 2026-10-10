import { RESERVED_NAME_WORDS } from './lexicon.js'
import { moderate } from './moderate.js'
import { normalize } from './normalize.js'

export type PenNameProblem = 'length' | 'characters' | 'contact' | 'reserved' | 'unkind'

export type PenNameCheck = { ok: true; value: string } | { ok: false; problem: PenNameProblem }

export const PEN_NAME_HINTS: Record<PenNameProblem, string> = {
  length: 'Between 2 and 32 characters.',
  characters: 'Letters, numbers, spaces, and . \' - only.',
  contact: 'No emails or long numbers — a pen name keeps you private.',
  reserved: 'Pen names can’t suggest a title or role. Professionals get a licensed mark instead.',
  unkind: 'Choose a different name.',
}

export const tidyPenName = (name: string) => name.normalize('NFKC').replace(/\s+/g, ' ').trim()

export const checkPenName = (input: string): PenNameCheck => {
  const value = tidyPenName(input)
  if (value.length < 2 || value.length > 32) return { ok: false, problem: 'length' }
  if (!/^[\p{L}\p{N} .'-]+$/u.test(value)) return { ok: false, problem: 'characters' }
  if (/\d{6,}/.test(value)) return { ok: false, problem: 'contact' }

  const words = normalize(value).words.split(' ')
  if (words.some((w) => RESERVED_NAME_WORDS.includes(w))) return { ok: false, problem: 'reserved' }
  if (moderate(value, { context: 'public' }).action === 'hold') return { ok: false, problem: 'unkind' }
  return { ok: true, value }
}

// Quiet, unremarkable suggestions: an adjective and a thing from a walk
const ADJECTIVES = [
  'Quiet', 'Slow', 'Grey', 'Soft', 'Late', 'Still', 'Low', 'Pale', 'Steady', 'Small',
  'Patient', 'Gentle', 'Mild', 'Plain', 'Faint', 'Warm', 'Cool', 'Even', 'Tidal', 'Dusk',
]
const NOUNS = [
  'Heron', 'River', 'Wren', 'Harbor', 'Fern', 'Lantern', 'Pebble', 'Moth', 'Willow', 'Tide',
  'Sparrow', 'Meadow', 'Cedar', 'Kettle', 'Thistle', 'Ember', 'Marsh', 'Finch', 'Birch', 'Cove',
]

export const suggestPenName = (rand: () => number = Math.random) =>
  `${ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]} ${NOUNS[Math.floor(rand() * NOUNS.length)]}`
