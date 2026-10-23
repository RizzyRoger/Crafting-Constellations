import type { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { checkInJoin, promptFits, promptHides, todaysCheckIn } from './checkin'
import type { Status } from './types'

const DAY = 86_400_000
const at = (ms: number) => ({ toDate: () => new Date(ms) }) as Timestamp
const post = (id: string, status: Status, ms = Date.now()) => ({ id, status, createdAt: at(ms) })

describe('todaysCheckIn', () => {
  it('passes over a withdrawn or removed check-in, which is gone', () => {
    expect(todaysCheckIn([post('a', 'withdrawn')])).toBeUndefined()
    expect(todaysCheckIn([post('a', 'removed')])).toBeUndefined()
  })

  it('finds an earlier one from today behind it', () => {
    expect(todaysCheckIn([post('b', 'withdrawn'), post('a', 'published', Date.now() - 1)])?.id).toBe('a')
  })

  it('counts one still being read, or held: it is still there, and its writer sees it', () => {
    for (const status of ['pending', 'published', 'held'] as const) expect(todaysCheckIn([post('a', status)])?.id).toBe('a')
  })

  it('doesn’t count an earlier day’s', () => {
    expect(todaysCheckIn([post('a', 'published', Date.now() - 2 * DAY)])).toBeUndefined()
  })
})

describe('promptHides', () => {
  it('steps aside for today’s check-in written earlier or elsewhere', () => {
    expect(promptHides({ id: 'a' }, null)).toBe(true)
    expect(promptHides({ id: 'a' }, 'b')).toBe(true)
  })

  it('stays with the one just sent from it, to say what became of it', () => {
    expect(promptHides({ id: 'a' }, 'a')).toBe(false)
  })

  it('stays while there is none today', () => {
    expect(promptHides(undefined, null)).toBe(false)
    expect(promptHides(undefined, 'a')).toBe(false)
  })
})

describe('checkInJoin', () => {
  type Answer = { loading: boolean; data: unknown; pending: boolean }
  const GROUP: Omit<Answer, 'pending'> = { loading: false, data: { name: 'Daily check-in' } }
  const LOADING: Answer = { loading: true, data: null, pending: false }
  const NONE: Answer = { loading: false, data: null, pending: false }
  const MEMBER: Answer = { loading: false, data: { uid: 'me' }, pending: false }
  const JOINING: Answer = { loading: false, data: { uid: 'me' }, pending: true }

  // How many times a visit joins, over the membership answers it hears in turn, as JoinCheckIn runs it
  const joins = (answers: Answer[], group = GROUP) => {
    let decided = false
    return answers.filter((answer) => {
      const step = checkInJoin(decided, group, answer)
      if (step !== 'wait') decided = true
      return step === 'join'
    }).length
  }

  it('joins once on a visit that starts outside the group', () => {
    expect(joins([LOADING, NONE, JOINING, MEMBER])).toBe(1)
  })

  it('never puts back a membership that goes later: a leave lasts the visit', () => {
    // Leaving drops the membership locally at once, then the server agrees
    expect(joins([LOADING, MEMBER, NONE, NONE])).toBe(0)
  })

  it('never puts back one the visit’s own join made, either', () => {
    // As when the account is deleted from another tab
    expect(joins([LOADING, NONE, JOINING, MEMBER, NONE])).toBe(1)
  })

  it('waits for an answer the server has, and for the group to be there', () => {
    expect(joins([LOADING, JOINING])).toBe(0)
    expect(joins([NONE], { loading: false, data: null })).toBe(0)
    expect(joins([NONE], { loading: true, data: null })).toBe(0)
    expect(checkInJoin(false, { loading: false, data: null }, NONE)).toBe('wait')
  })
})

describe('promptFits', () => {
  it('sits above pages that flow', () => {
    for (const page of ['/constellation', '/messages', '/notifications', '/professional', '/chats/new', '/groups/g/posts/p', '/admin'])
      expect(promptFits(page)).toBe(true)
  })

  it('leaves out pages that fill the shell, and You, which has its own', () => {
    for (const page of ['/groups/g', '/groups/g/', '/chats/c', '/messages/a_b', '/me', '/Groups/g'])
      expect(promptFits(page)).toBe(false)
  })
})
