import { describe, expect, it } from 'vitest'
import { hasMention, splitMentions } from './index.js'

describe('hasMention', () => {
  it('finds a pen name with spaces, in any case', () => {
    expect(hasMention('thinking of you @Quiet Heron', 'Quiet Heron')).toBe(true)
    expect(hasMention('@quiet heron, are you around?', 'Quiet Heron')).toBe(true)
  })

  it('needs the whole name, not the start of a longer word', () => {
    expect(hasMention('@Fernanda said hi', 'Fern')).toBe(false)
    expect(hasMention('@Fern2 said hi', 'Fern')).toBe(false)
    expect(hasMention('@Fern. said hi', 'Fern')).toBe(true)
    expect(hasMention('@Fern’s note', 'Fern')).toBe(true)
  })

  it('ignores email addresses and names without the @', () => {
    expect(hasMention('write to fern@example.test', 'example.test')).toBe(false)
    expect(hasMention('Quiet Heron was here', 'Quiet Heron')).toBe(false)
  })

  it('finds a later mention after an earlier near miss', () => {
    expect(hasMention('@Fernanda and @Fern', 'Fern')).toBe(true)
  })

  it('handles names with . \' and -', () => {
    expect(hasMention('thanks @Mary-Jo O’Neil.', 'Mary-Jo O’Neil')).toBe(true)
    expect(hasMention('thanks @J.R.', 'J.R.')).toBe(true)
  })

  it('is false for an empty name', () => {
    expect(hasMention('@ hello', '')).toBe(false)
  })
})

describe('splitMentions', () => {
  const people = [
    { uid: 'q', penName: 'Quiet' },
    { uid: 'qh', penName: 'Quiet Heron' },
    { uid: 'f', penName: 'Fern' },
  ]

  it('cuts text into plain runs and mentions', () => {
    expect(splitMentions('hi @Fern, and @quiet heron!', people)).toEqual([
      { text: 'hi ' },
      { text: '@Fern', uid: 'f' },
      { text: ', and ' },
      { text: '@quiet heron', uid: 'qh' },
      { text: '!' },
    ])
  })

  it('prefers the longer name', () => {
    expect(splitMentions('@Quiet Heron', people)).toEqual([{ text: '@Quiet Heron', uid: 'qh' }])
    expect(splitMentions('@Quiet Hour', people)).toEqual([{ text: '@Quiet', uid: 'q' }, { text: ' Hour' }])
  })

  it('leaves unknown names and stray @ as plain text', () => {
    expect(splitMentions('@Someone else @ here', people)).toEqual([{ text: '@Someone else @ here' }])
  })

  it('returns the text untouched with nobody to match', () => {
    expect(splitMentions('@Fern', [])).toEqual([{ text: '@Fern' }])
    expect(splitMentions('', people)).toEqual([])
  })

  it('keeps every character', () => {
    const text = 'a @Fern b @Fern@Fern @Quiet Heron.'
    expect(splitMentions(text, people).map((s) => s.text).join('')).toBe(text)
  })
})
