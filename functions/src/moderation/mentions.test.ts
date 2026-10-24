import { describe, expect, it } from 'vitest'
import { hasMention, mentionedIn, splitMentions } from './index.js'

const people = [
  { uid: 'q', penName: 'Quiet' },
  { uid: 'qh', penName: 'Quiet Heron' },
  { uid: 'f', penName: 'Fern' },
]

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

  // A vowel sign is a combining mark, not a letter, but it carries on the word
  it('reads a vowel sign as part of the name', () => {
    expect(hasMention('hi @प्रिया', 'प्रिय')).toBe(false)
    expect(hasMention('hi @प्रिया!', 'प्रिया')).toBe(true)
    expect(hasMention('नमस्ते@प्रिया', 'प्रिया')).toBe(false)
  })

  // An emoji's variation selector or keycap is a mark, but not part of a word
  it('finds a mention straight after an emoji', () => {
    expect(hasMention('\u2764\ufe0f@Fern hi', 'Fern')).toBe(true)
    expect(hasMention('1\ufe0f\u20e3@Fern hi', 'Fern')).toBe(true)
  })

  it('is false for an empty name', () => {
    expect(hasMention('@ hello', '')).toBe(false)
  })
})

describe('splitMentions', () => {
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

describe('mentionedIn', () => {
  it('names the people the drawing marks, the longer name winning', () => {
    expect(mentionedIn('@Quiet Heron thank you', people)).toEqual(new Set(['qh']))
    expect(mentionedIn('@Quiet and @quiet heron, @Fern', people)).toEqual(new Set(['q', 'qh', 'f']))
    expect(mentionedIn('@Quiet Hour', people)).toEqual(new Set(['q']))
    expect(mentionedIn('no one here', people)).toEqual(new Set())
  })
})
