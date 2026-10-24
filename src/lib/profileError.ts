import { PEN_NAME_HINTS, type PenNameProblem } from '@moderation'

export interface ProfileError {
  // Under the note, or above the save button
  at: 'note' | 'form'
  text: string
}

// saveProfile names the refused field in the error message ('pen-name' or 'note') and the reason in
// details.problem. Both fields use 'length' and 'unkind', so the field has to pick the words.
export const profileErrorOf = (message: string, problem: string | undefined, fallback: string): ProfileError => {
  if (message === 'note') {
    return { at: 'note', text: problem === 'length' ? 'Up to 160 characters.' : 'Leave out links, emails, phone numbers and anything unkind.' }
  }
  if (problem === 'taken') return { at: 'form', text: 'Someone already uses that pen name.' }
  if (problem && Object.hasOwn(PEN_NAME_HINTS, problem)) return { at: 'form', text: PEN_NAME_HINTS[problem as PenNameProblem] }
  return { at: 'form', text: fallback }
}
