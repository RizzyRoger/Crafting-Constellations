import { describe, expect, it } from 'vitest'
import { applicationProblem, MAX_BYTES, openSlots, reapplyNote } from './proApplication'

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
