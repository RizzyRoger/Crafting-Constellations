import { describe, expect, it, vi } from 'vitest'
import { holds, nextRound, type Filed, type Queued, type Round } from './reportPolicy.js'

const at = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds })
const filed = (reporterUid: string, createdAt: unknown = at(100), reason = 'harassment') => ({ reporterUid, reason, createdAt })

interface Played {
  queued?: Queued
  sent: Filed[]
  round?: Round | null
  hold: boolean
  // How often it read every report on the writing
  reads: number
}

// Each report in turn as handleReport files it (merged into the queue item), with a moderator
// keeping the writing up at each 'keep'. Every report stays in the reports collection, counted
// or not. Gives the item, the reports, what the last report did and the reads it all took.
const play = (steps: string[]) =>
  steps.reduce<Promise<Played>>(
    async (previous, step, i) => {
      const last = await previous
      if (step === 'keep') return { ...last, queued: { ...last.queued, state: 'resolved', resolvedAt: at(i) }, round: undefined, hold: false }
      const report = filed(step, at(i))
      const sent = [...last.sent, report]
      const round = nextRound(last.queued, report)
      if (!round) return { ...last, sent, round, hold: false }
      const read = vi.fn(async () => sent)
      const hold = await holds(round, last.queued, read)
      const { reporterUids, reasons } = round
      return { queued: { ...last.queued, state: 'open', reports: { reporterUids, reasons } }, sent, round, hold, reads: last.reads + read.mock.calls.length }
    },
    Promise.resolve({ sent: [], hold: false, reads: 0 }),
  )

describe('nextRound', () => {
  it('starts the queue entry with the first report', () => {
    expect(nextRound(undefined, filed('a'))).toEqual({ reporterUids: ['a'], reasons: ['harassment'], priority: 1 })
    // Held by automod first: no reports yet
    expect(nextRound({ state: 'open' }, filed('a'))).toEqual({ reporterUids: ['a'], reasons: ['harassment'], priority: 1 })
  })

  it('adds each new person to the round, and each reason once', () => {
    const queued = { state: 'open', reports: { reporterUids: ['a', 'b'], reasons: ['harassment'] } }
    expect(nextRound(queued, filed('c', at(100), 'spam'))).toMatchObject({ reporterUids: ['a', 'b', 'c'], reasons: ['harassment', 'spam'] })
    expect(nextRound(queued, filed('c'))).toMatchObject({ reporterUids: ['a', 'b', 'c'], reasons: ['harassment'] })
  })

  it('counts the same person once in a round, so a replayed report changes nothing', () => {
    expect(nextRound({ state: 'open', reports: { reporterUids: ['a'], reasons: ['spam'] } }, filed('a'))).toBeNull()
  })

  it('starts a new round after a moderator decides', () => {
    const kept: Queued = { state: 'resolved', resolvedAt: at(200), reports: { reporterUids: ['a', 'b', 'c'], reasons: ['harassment', 'spam'] } }
    expect(nextRound(kept, filed('d', at(300), 'other'))).toEqual({ reporterUids: ['d'], reasons: ['other'], priority: 1 })
  })

  it('lets someone who reported before report again after a decision, and keeps no one else on the item', () => {
    const reset: Queued = { state: 'resolved', resolvedAt: at(200), reports: { reporterUids: ['alice', 'bob'], reasons: ['impersonation'] } }
    expect(nextRound(reset, filed('alice', at(300), 'impersonation'))).toEqual({ reporterUids: ['alice'], reasons: ['impersonation'], priority: 1 })
  })

  it('never counts a report filed before the decision, which was made with it', () => {
    const kept: Queued = { state: 'resolved', resolvedAt: at(200, 500), reports: { reporterUids: ['a', 'b', 'c'] } }
    // A replay of one counted then, or one dropped then (the writing was already hidden)
    expect(nextRound(kept, filed('a', at(150)))).toBeNull()
    expect(nextRound(kept, filed('d', at(150)))).toBeNull()
    expect(nextRound(kept, filed('d', at(200, 500)))).toBeNull()
    expect(nextRound(kept, filed('d', at(200, 501)))).toMatchObject({ reporterUids: ['d'], reasons: ['harassment'] })
  })

  it('keeps old reports out of a round reopened since the decision', () => {
    const reopened: Queued = { state: 'open', resolvedAt: at(200), reports: { reporterUids: ['d'], reasons: ['other'] } }
    expect(nextRound(reopened, filed('a', at(150)))).toBeNull()
    expect(nextRound(reopened, filed('e', at(250)))).toMatchObject({ reporterUids: ['d', 'e'], reasons: ['other', 'harassment'] })
  })

  it('counts a report with no time only until a moderator has decided', () => {
    expect(nextRound({ state: 'open' }, filed('a', undefined))).toMatchObject({ reporterUids: ['a'], reasons: ['harassment'] })
    expect(nextRound({ state: 'resolved', resolvedAt: at(200) }, filed('a', undefined))).toBeNull()
  })

  it('ranks a round by what was reported in it, or by automod finding crisis language', () => {
    const kept: Queued = { state: 'resolved', resolvedAt: at(200), reports: { reporterUids: ['a'], reasons: ['selfHarm'] } }
    expect(nextRound(kept, filed('b', at(300), 'spam'))?.priority).toBe(1)
    expect(nextRound(kept, filed('b', at(300), 'selfHarm'))?.priority).toBe(2)
    // Still in the round a self-harm report opened
    expect(nextRound({ state: 'open', reports: { reporterUids: ['a'], reasons: ['selfHarm'] } }, filed('b', at(300), 'spam'))?.priority).toBe(2)
    expect(nextRound({ ...kept, automod: { crisis: true } }, filed('b', at(300), 'spam'))?.priority).toBe(2)
    expect(nextRound({ ...kept, automod: { crisis: false } }, filed('b', at(300), 'spam'))?.priority).toBe(1)
  })
})

describe('holds', () => {
  it('hides the writing once three people report it', async () => {
    expect((await play(['a', 'b'])).hold).toBe(false)
    expect((await play(['a', 'b', 'c'])).hold).toBe(true)
  })

  it('never lets the same three hide writing a moderator kept, however often they report it', async () => {
    const again = await play(['a', 'b', 'c', 'keep', 'a', 'b', 'c'])
    // They still bring it back to the queue
    expect(again.queued).toMatchObject({ state: 'open', reports: { reporterUids: ['a', 'b', 'c'] } })
    expect(again).toMatchObject({ round: { reporterUids: ['a', 'b', 'c'] }, hold: false })
    expect((await play(['a', 'b', 'c', 'keep', 'a', 'b', 'c', 'keep', 'c', 'b', 'a'])).hold).toBe(false)
  })

  it('hides it again once three people new to it report it, whoever else reports it with them', async () => {
    expect((await play(['a', 'b', 'c', 'keep', 'a', 'd', 'e'])).hold).toBe(false)
    expect((await play(['a', 'b', 'c', 'keep', 'a', 'd', 'e', 'f'])).hold).toBe(true)
    // Someone new in the second round has reported it before by the third
    expect((await play(['a', 'b', 'c', 'keep', 'd', 'keep', 'd', 'e', 'f'])).hold).toBe(false)
    expect((await play(['a', 'b', 'c', 'keep', 'd', 'keep', 'd', 'e', 'f', 'g'])).hold).toBe(true)
  })

  it('stays safe to replay when someone who reported before reports again', async () => {
    const { queued } = await play(['a', 'b', 'c', 'keep', 'a', 'd'])
    expect(nextRound(queued, filed('a', at(4)))).toBeNull()
    expect(nextRound(queued, filed('b', at(0)))).toBeNull()
  })

  it('goes by every report filed before the decision, not only those the item counted', async () => {
    // d reported it once it was already hidden, so the item only has a, b and c; and an item
    // reopened before rounds were tracked like this has lost them all
    const before = [filed('a'), filed('b'), filed('c'), filed('d', at(150))]
    const round = (reporterUids: string[]) => ({ reporterUids, reasons: ['harassment'], priority: 1 })
    const reopened: Queued = { state: 'open', resolvedAt: at(200), reports: { reporterUids: ['d', 'e'], reasons: ['harassment'] } }
    expect(await holds(round(['d', 'e', 'f']), reopened, async () => [...before, filed('d', at(300)), filed('e', at(310)), filed('f', at(320))])).toBe(false)
    const lost: Queued = { state: 'open', resolvedAt: at(200), reports: { reporterUids: ['a', 'b'], reasons: ['harassment'] } }
    expect(await holds(round(['a', 'b', 'c']), lost, async () => [...before, filed('a', at(300)), filed('b', at(310)), filed('c', at(320))])).toBe(false)
  })

  it('reads the reports only when they could change the answer', async () => {
    const read = vi.fn(async () => [filed('a'), filed('b'), filed('c')])
    const round = (reporterUids: string[]) => ({ reporterUids, reasons: ['harassment'], priority: 1 })
    // Too few to hide it, or no decision for anyone to have reported before
    expect(await holds(round(['a', 'b']), { state: 'open', resolvedAt: at(200) }, read)).toBe(false)
    expect(await holds(round(['a', 'b', 'c']), { state: 'open' }, read)).toBe(true)
    expect(await holds(round(['a', 'b', 'c']), undefined, read)).toBe(true)
    expect(read).not.toHaveBeenCalled()
    expect(await holds(round(['a', 'b', 'c']), { state: 'open', resolvedAt: at(200) }, read)).toBe(false)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('takes no reads for one person reporting over and over, and one for each new person once three could hide it', async () => {
    const flood = await play(['a', 'b', 'c', 'keep', ...Array<string>(50).fill('x'), 'a'])
    expect(flood).toMatchObject({ round: { reporterUids: ['x', 'a'] }, reads: 0 })
    expect(await play(['a', 'b', 'c', 'keep', 'a', 'a', 'b', 'b', 'c', 'c', 'd', 'e', 'f'])).toMatchObject({ hold: true, reads: 4 })
  })
})
