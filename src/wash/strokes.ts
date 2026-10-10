import type { Stroke } from './field'

// Brush paths, as module constants so React effects see stable identities.

// Landing: the comp at real scale (board 01)
export const HERO: readonly Stroke[] = [
  { from: [0.07, 0.62], to: [0.99, 0.14], width: 0.54, density: 1, falloff: 2, rag: 0.18, dry: 0.65, pool: 0.5 },
  { from: [0.05, 0.84], to: [0.84, 0.44], width: 0.36, density: 0.6, falloff: 2.1, rag: 0.24, dry: 0.7, pool: 0.25 },
  { from: [0.2, 0.36], to: [0.96, 0.05], width: 0.2, density: 0.32, falloff: 1.3, rag: 0.26, dry: 0.75, pool: 0 },
  { from: [0.05, 0.65], to: [0.32, 0.52], width: 0.26, density: 0.9, falloff: 0.9, rag: 0.28, dry: 0.2, pool: 0.6, edgeFreq: 9 },
]

// Page heads: one short diagonal stroke beside the title
export const HEAD: readonly Stroke[] = [
  { from: [0.06, 0.7], to: [0.98, 0.3], width: 0.62, density: 1, falloff: 1.7, rag: 0.18, dry: 0.65, pool: 0.5 },
  { from: [0.08, 0.86], to: [0.7, 0.62], width: 0.34, density: 0.5, falloff: 2, rag: 0.24, dry: 0.7, pool: 0.2 },
]

// A quieter, descending stroke for working pages (groups, messages)
export const HEAD_DESCENDING: readonly Stroke[] = [
  { from: [0.08, 0.28], to: [0.98, 0.74], width: 0.6, density: 0.92, falloff: 1.8, rag: 0.18, dry: 0.65, pool: 0.45 },
  { from: [0.1, 0.52], to: [0.72, 0.9], width: 0.3, density: 0.45, falloff: 2, rag: 0.24, dry: 0.7, pool: 0.2 },
]

// Auth pages: a portrait stroke (board 04)
export const PORTRAIT: readonly Stroke[] = [
  { from: [0.1, 0.12], to: [0.96, 0.88], width: 0.62, density: 1, falloff: 1.8, rag: 0.18, dry: 0.65, pool: 0.55 },
  { from: [0.14, 0.4], to: [0.72, 0.98], width: 0.34, density: 0.5, falloff: 2, rag: 0.24, dry: 0.7, pool: 0.2 },
]
