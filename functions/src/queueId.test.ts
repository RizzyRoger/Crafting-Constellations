import { describe, expect, it } from 'vitest'
import { queueIdFor } from './queueId.js'

describe('queueIdFor', () => {
  it('keeps the ids the app has always made', () => {
    expect(queueIdFor('groups/g1/posts/p1/comments/c1')).toBe('groups~g1~posts~p1~comments~c1')
    expect(queueIdFor('dms/alice_bob/messages/Xy3kQ9aB2cD4eF6gH8iJ')).toBe('dms~alice_bob~messages~Xy3kQ9aB2cD4eF6gH8iJ')
    expect(queueIdFor('groups/late-night-caregivers-x1y2/messages/m1')).toBe('groups~late-night-caregivers-x1y2~messages~m1')
    expect(queueIdFor('users/u1')).toBe('users~u1')
  })

  it('never gives a post named after a comment’s path that comment’s id', () => {
    expect(queueIdFor('groups/G/posts/P~comments~C')).not.toBe(queueIdFor('groups/G/posts/P/comments/C'))
  })

  it('never gives two different paths one id, even ones holding the escape itself', () => {
    const paths = [
      'groups/G/posts/P/comments/C',
      'groups/G/posts/P~comments~C',
      'groups/G/posts/P%7Ecomments%7EC',
      'groups/G/posts/P%257Ecomments%257EC',
      'groups/G/posts/P%7Ecomments~C',
      'groups/G/messages/a~b',
      'groups/G/messages/a%7Eb',
      'groups/G/messages/a%b',
      'groups/G/messages/a%25b',
    ]
    expect(new Set(paths.map(queueIdFor)).size).toBe(paths.length)
  })
})
