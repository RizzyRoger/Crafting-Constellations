import { describe, expect, it } from 'vitest'
import { followStored, storedFields } from './profileFields'

const stored = { penName: 'Grey Heron', note: 'Here mostly at night.' }
// admin.ts resetProfile: a generated name and an empty note
const reset = { penName: 'Quiet Fern', note: '' }

describe('followStored', () => {
  it('takes a moderator reset into fields the person left alone', () => {
    // Otherwise pressing Save to change only the pigment sends the removed name and note back
    expect(followStored(stored, stored, reset)).toEqual(reset)
  })

  it('keeps what the person is writing when a reset lands mid-edit', () => {
    const fields = { penName: 'Grey Heron', note: 'Daughter, far from home.' }
    expect(followStored(fields, stored, reset)).toEqual({ penName: 'Quiet Fern', note: 'Daughter, far from home.' })
  })

  it('leaves the fields alone after the person saves a new name with a crisis note', () => {
    // The server keeps the old note, so the typed one stays beside the crisis card
    const fields = { penName: 'Night Owl', note: 'I want to die' }
    expect(followStored(fields, stored, { ...stored, penName: 'Night Owl' })).toEqual(fields)
  })

  it('reads a missing note as empty, as the form does', () => {
    expect(storedFields({ id: 'u1', penName: 'Grey Heron', avatarSeed: 'u1', pigment: 'paynesBlue', pro: false, banned: false })).toEqual({
      penName: 'Grey Heron',
      note: '',
    })
    expect(storedFields(null)).toEqual({ penName: '', note: '' })
  })
})
