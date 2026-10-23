import { describe, expect, it } from 'vitest'
import { imeKey, insertMention, keptMentions, matchPeople, mentionQuery } from './mentions'

describe('mentionQuery', () => {
  it('finds the @name being typed at the caret', () => {
    expect(mentionQuery('hi @Fe', 6)).toEqual({ start: 3, query: 'Fe' })
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQuery('hi @Quiet He', 12)).toEqual({ start: 3, query: 'Quiet He' })
  })

  it('reads only up to the caret', () => {
    expect(mentionQuery('hi @Fern there', 6)).toEqual({ start: 3, query: 'Fe' })
  })

  it('ignores email addresses, new lines, double spaces and a space straight after @', () => {
    expect(mentionQuery('mail fern@exam', 14)).toBeNull()
    expect(mentionQuery('@Fern\nnext', 10)).toBeNull()
    expect(mentionQuery('@Fern  and', 10)).toBeNull()
    expect(mentionQuery('@ Fern', 6)).toBeNull()
    expect(mentionQuery('no at sign', 10)).toBeNull()
  })

  it('reads a vowel sign before the @ as part of a word', () => {
    expect(mentionQuery('hi @प्रि', 8)).toEqual({ start: 3, query: 'प्रि' })
    const text = 'नमस्ते@प्रि'
    expect(mentionQuery(text, text.length)).toBeNull()
  })

  it('opens straight after an emoji', () => {
    expect(mentionQuery('\u2764\ufe0f@Fe', 5)).toEqual({ start: 2, query: 'Fe' })
    expect(mentionQuery('1\ufe0f\u20e3@Fe', 6)).toEqual({ start: 3, query: 'Fe' })
  })

  it('stops looking past a pen name’s length', () => {
    const long = `@${'a'.repeat(33)}`
    expect(mentionQuery(long, long.length)).toBeNull()
  })
})

describe('insertMention', () => {
  it('replaces the query with the name and a space, caret after it', () => {
    expect(insertMention('hi @Fe', 3, 6, 'Fern')).toEqual({ text: 'hi @Fern ', caret: 9 })
  })

  it('keeps the rest of the text and does not double a space', () => {
    expect(insertMention('hi @Fe and you', 3, 6, 'Fern')).toEqual({ text: 'hi @Fern and you', caret: 9 })
    expect(insertMention('@Qu!', 0, 3, 'Quiet Heron')).toEqual({ text: '@Quiet Heron !', caret: 13 })
  })
})

describe('matchPeople', () => {
  const people = [{ penName: 'Quiet Heron' }, { penName: 'Fern' }, { penName: 'Slow Fern' }, { penName: 'Ferry Lantern' }]

  it('puts names that start with the query first, then names with a matching word', () => {
    expect(matchPeople(people, 'fer').map((p) => p.penName)).toEqual(['Fern', 'Ferry Lantern', 'Slow Fern'])
  })

  it('lists everyone, alphabetically, for a bare @', () => {
    expect(matchPeople(people, '').map((p) => p.penName)).toEqual(['Fern', 'Ferry Lantern', 'Quiet Heron', 'Slow Fern'])
  })

  it('matches across a space and caps the list', () => {
    expect(matchPeople(people, 'quiet h').map((p) => p.penName)).toEqual(['Quiet Heron'])
    expect(matchPeople(people, '', 2)).toHaveLength(2)
    expect(matchPeople(people, 'zz')).toEqual([])
  })
})

describe('keptMentions', () => {
  it('keeps only picks whose name is still in the words', () => {
    const picked = new Map([
      ['f', 'Fern'],
      ['q', 'Quiet Heron'],
    ])
    expect(keptMentions('thanks @Fern', picked)).toEqual(['f'])
    expect(keptMentions('thanks @Fern and @Quiet Heron', picked)).toEqual(['f', 'q'])
    expect(keptMentions('thanks', picked)).toEqual([])
  })

  it('drops a pick whose name only starts a longer picked name', () => {
    const picked = new Map([
      ['q', 'Quiet'],
      ['qh', 'Quiet Heron'],
    ])
    expect(keptMentions('@Quiet Heron thank you', picked)).toEqual(['qh'])
    expect(keptMentions('@Quiet and @Quiet Heron', picked)).toEqual(['q', 'qh'])
  })
})

describe('imeKey', () => {
  it('leaves keys to an IME that is composing, or that just confirmed in Safari', () => {
    expect(imeKey({ isComposing: true, keyCode: 229 })).toBe(true)
    expect(imeKey({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(imeKey({ isComposing: true, keyCode: 40 })).toBe(true)
  })

  it('lets ordinary keys pick, move and send', () => {
    expect(imeKey({ isComposing: false, keyCode: 13 })).toBe(false)
    expect(imeKey({ isComposing: false, keyCode: 40 })).toBe(false)
  })
})
