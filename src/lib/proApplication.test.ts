import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import {
  applicationProblem,
  documentRoom,
  documentsHint,
  MAX_BYTES,
  openSlots,
  placeDocuments,
  reapplyNote,
  reapplyRound,
  slotsToCheck,
  SLOTS,
} from './proApplication'

const pdf = { name: 'licence.pdf', size: 2048, type: 'application/pdf' }
const draft = {
  legalName: 'Alice Example',
  licenseRegion: 'Oregon, US',
  licenseNumber: 'C-1234',
  files: [pdf],
  listed: [] as string[],
  open: 5,
}

describe('licence document slots', () => {
  it('start with the first one for a new applicant', () => {
    expect(openSlots([])[0]).toBe('doc-1')
  })

  it('skip the ones already on the application', () => {
    expect(openSlots(['doc-1', 'doc-2'])).toEqual(['doc-3', 'doc-4', 'doc-5'])
  })

  it('skip files a failed attempt left in Storage, which can never be written again', () => {
    expect(openSlots([], ['doc-1'])).toEqual(['doc-2', 'doc-3', 'doc-4', 'doc-5'])
    expect(openSlots(['doc-1'], ['doc-2', 'doc-4'])).toEqual(['doc-3', 'doc-5'])
  })
})

// As reviewProfessional leaves an application it turned down. A server time can carry microseconds,
// which the SDK's toMillis() keeps as a fraction
const reviewedAt = new Timestamp(1_729_700_000, 123_456_789)
const R = '1729700000123'
const turnedDown = (files: string[], status = 'denied') => ({ status, files, reviewedAt })

// Five documents in, a turned-down applicant still has to be able to send a corrected licence
describe('documents on a reapplication', () => {
  it('go in a folder for the decision they answer', () => {
    expect(reapplyRound(turnedDown(SLOTS))).toBe(R)
    expect(reapplyRound(turnedDown(['doc-1'], 'revoked'))).toBe(R)
    expect(reapplyRound(null)).toBeNull()
    expect(reapplyRound(turnedDown(SLOTS, 'submitted'))).toBeNull()
    expect(reapplyRound(turnedDown(SLOTS, 'approved'))).toBeNull()
    expect(reapplyRound({ status: 'denied', files: SLOTS })).toBeNull()
  })

  // storage.rules names it string(reviewedAt.toMillis()), which drops the fraction
  it('name the folder in whole milliseconds, as the rules do', () => {
    const late = new Timestamp(1_729_700_000, 123_999_999)
    expect(late.toMillis()).not.toBe(1_729_700_000_123)
    expect(reapplyRound({ status: 'denied', reviewedAt: late })).toBe(R)
    expect(reapplyRound({ status: 'denied', reviewedAt: new Timestamp(1_729_700_000, 0) })).toBe('1729700000000')
  })

  it('have room for five even when every slot was used, and so does a first application', () => {
    expect(documentRoom(turnedDown(SLOTS))).toBe(5)
    expect(documentRoom(turnedDown(SLOTS, 'revoked'))).toBe(5)
    expect(documentRoom(null)).toBe(5)
    expect(documentRoom({ status: 'approved', files: ['doc-1', 'doc-2'] })).toBe(3)
  })

  it('take free slots first, added to the ones sent before', () => {
    expect(placeDocuments({ listed: ['doc-1', 'doc-2'], free: ['doc-3', 'doc-4', 'doc-5'], count: 2, round: R })).toEqual({
      names: ['doc-3', 'doc-4'],
      files: ['doc-1', 'doc-2', 'doc-3', 'doc-4'],
    })
    expect(placeDocuments({ listed: [], free: SLOTS, count: 1, round: null })).toEqual({ names: ['doc-1'], files: ['doc-1'] })
  })

  it('go in the round past the free slots: added while five fit, instead of the ones sent before after', () => {
    // Two listed, three left in Storage by a try that never reached the application
    expect(placeDocuments({ listed: ['doc-1', 'doc-2'], free: [], count: 2, round: R })).toEqual({
      names: [`${R}/doc-1`, `${R}/doc-2`],
      files: ['doc-1', 'doc-2', `${R}/doc-1`, `${R}/doc-2`],
    })
    expect(placeDocuments({ listed: SLOTS, free: [], count: 1, round: R })).toEqual({ names: [`${R}/doc-1`], files: [`${R}/doc-1`] })
    expect(placeDocuments({ listed: SLOTS, free: [], count: 0, round: R })).toEqual({ names: [], files: SLOTS })
  })

  // An earlier reapplication sent five in its folder; the top-level slots it left are free but a
  // sixth name would be refused, after a write-once upload
  it('go in the round when free slots are left but the documents sent before fill the application', () => {
    const before = SLOTS.map((s) => `1729600000000/${s}`)
    expect(placeDocuments({ listed: before, free: ['doc-2', 'doc-3', 'doc-4', 'doc-5'], count: 1, round: R })).toEqual({
      names: [`${R}/doc-1`],
      files: [`${R}/doc-1`],
    })
    expect(placeDocuments({ listed: before.slice(0, 2), free: SLOTS, count: 4, round: R })).toEqual({
      names: SLOTS.slice(0, 4).map((s) => `${R}/${s}`),
      files: SLOTS.slice(0, 4).map((s) => `${R}/${s}`),
    })
  })

  it('are looked for in Storage only where they could go', () => {
    expect(slotsToCheck(null, 2)).toEqual([])
    expect(slotsToCheck(turnedDown(['doc-1', 'doc-2']), 0)).toEqual([])
    expect(slotsToCheck(turnedDown(['doc-1', 'doc-2']), 3)).toEqual(['doc-3', 'doc-4', 'doc-5'])
    expect(slotsToCheck(turnedDown(['doc-1', 'doc-2']), 4)).toEqual([])
    expect(slotsToCheck(turnedDown(SLOTS.map((s) => `1729600000000/${s}`)), 1)).toEqual([])
  })

  it('say what becomes of the documents sent before', () => {
    expect(documentsHint(0, [])).toBeNull()
    expect(documentsHint(0, ['licence.pdf'])).toBe('licence.pdf')
    expect(documentsHint(5, [])).toBe('The documents you sent before stay with your application.')
    expect(documentsHint(2, ['licence.pdf'])).toBe('licence.pdf — added to the documents you sent before.')
    expect(documentsHint(5, ['licence.pdf', 'scan.png'])).toBe('licence.pdf, scan.png — sent instead of the documents you sent before.')
  })

  it('pass the checks with every slot used, so the corrected licence can go', () => {
    expect(applicationProblem({ ...draft, listed: SLOTS, open: documentRoom(turnedDown(SLOTS)) })).toBeNull()
  })

  // Every application the page could be looking at, every Storage leftover and every number of new
  // documents, sent as submit() sends them
  it('always list five or fewer, never write a used slot, and do what the hint says', () => {
    const subsets = (of: readonly string[]): string[][] =>
      of.reduce<string[][]>((all, s) => [...all, ...all.map((x) => [...x, s])], [[]])
    const listings = [0, 1, 2, 3, 4, 5].flatMap((top) =>
      [0, 1, 2, 3, 4, 5].filter((folder) => top + folder >= 1 && top + folder <= 5).map((folder) => [
        ...SLOTS.slice(5 - top),
        ...SLOTS.slice(0, folder).map((s) => `1729600000000/${s}`),
      ]),
    )
    const apps = [null, ...listings.map((files) => turnedDown(files))]
    for (const app of apps) {
      const listed = app?.files ?? []
      const round = reapplyRound(app)
      for (const stored of subsets(openSlots(listed))) {
        for (const count of [0, 1, 2, 3, 4, 5]) {
          const chosen = Array.from({ length: count }, (_, i) => `scan-${i}.pdf`)
          const free = openSlots(listed, slotsToCheck(app, count).filter((s) => stored.includes(s)))
          const files = chosen.map((name) => ({ ...pdf, name }))
          const problem = applicationProblem({ ...draft, files, listed, open: round ? SLOTS.length : free.length })
          // A turned-down applicant can always send up to five
          if (round) expect(problem).toBeNull()
          if (problem) continue
          const placed = placeDocuments({ listed, free, count, round })
          const at = JSON.stringify({ listed, stored, count, placed })
          expect(placed.files.length, at).toBeLessThanOrEqual(5)
          expect(new Set(placed.files).size, at).toBe(placed.files.length)
          expect(placed.names, at).toHaveLength(count)
          // Top-level slots are write-once once there's an application
          if (app) expect(placed.names.filter((n) => stored.includes(n) || listed.includes(n)), at).toEqual([])
          if (!listed.length || !count) continue
          const kept = listed.every((f) => placed.files.includes(f))
          expect(kept || placed.files.join() === placed.names.join(), at).toBe(true)
          expect(documentsHint(listed.length, chosen), at).toMatch(kept ? /added to/ : /sent instead of/)
        }
      }
    }
  })
})

describe('an application before anything uploads', () => {
  it('goes when it meets the rules', () => {
    expect(applicationProblem(draft)).toBeNull()
  })

  it('is stopped when a field is too short once trimmed', () => {
    expect(applicationProblem({ ...draft, licenseNumber: '7 ' })).toMatch(/licence number/)
    expect(applicationProblem({ ...draft, legalName: ' J' })).toMatch(/legal name/)
    expect(applicationProblem({ ...draft, licenseRegion: '  ' })).toMatch(/licensed/)
  })

  it('is stopped for a file the upload rule refuses', () => {
    expect(applicationProblem({ ...draft, files: [pdf, { name: 'scan.heic', size: 900, type: 'image/heic' }] })).toMatch(/scan\.heic/)
    expect(applicationProblem({ ...draft, files: [{ name: 'dropped', size: 900, type: '' }] })).toMatch(/dropped/)
    expect(applicationProblem({ ...draft, files: [{ ...pdf, size: 0 }] })).toMatch(/empty/)
    expect(applicationProblem({ ...draft, files: [{ ...pdf, size: MAX_BYTES + 1 }] })).toMatch(/10 MB/)
  })

  it('needs a document the first time, but a resubmission can keep the ones sent before', () => {
    expect(applicationProblem({ ...draft, files: [] })).toMatch(/at least one document/)
    expect(applicationProblem({ ...draft, files: [], listed: ['doc-1'], open: 4 })).toBeNull()
    expect(applicationProblem({ ...draft, files: [], listed: ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5'], open: 0 })).toBeNull()
  })

  it('is stopped when there are more files than free slots', () => {
    expect(applicationProblem({ ...draft, files: [pdf, pdf], open: 1 })).toMatch(/add 1 more/)
    expect(applicationProblem({ ...draft, open: 0 })).toMatch(/no room/)
  })
})

describe('the note above the form', () => {
  it('says a denied applicant can apply again, with the moderator’s note', () => {
    expect(reapplyNote({ status: 'denied', reviewNote: 'The number didn’t match.' })).toBe(
      'Your last application wasn’t approved. Note: The number didn’t match. You can apply again.',
    )
  })

  it('tells someone whose mark was removed that they can apply again', () => {
    expect(reapplyNote({ status: 'revoked', reviewNote: '' })).toBe('A moderator removed your licensed mark. You can apply again.')
  })

  it('stays away for a first application', () => {
    expect(reapplyNote(null)).toBeNull()
  })
})
