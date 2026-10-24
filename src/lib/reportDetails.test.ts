import type { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { readsReports, reportDetails } from './reportDetails'
import type { FiledReport } from './types'

const at = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds }) as Timestamp
const filed = (id: string, reporterUid: string, createdAt: Timestamp | null, details?: string, reason = 'other'): FiledReport => ({
  id,
  reporterUid,
  contentPath: 'groups/g1/posts/p1',
  reason,
  ...(details === undefined ? {} : { details }),
  createdAt,
})

// Reported by a and b since a moderator kept it at 200
const item = { authorUid: 'writer', reports: { count: 2, reasons: ['other'], reporterUids: ['a', 'b'] }, resolvedAt: at(200) }

describe('reportDetails', () => {
  it('gives what the open round’s reporters wrote, oldest first, and never who they are', () => {
    const words = reportDetails(item, [filed('r2', 'b', at(320), 'Pretending to be my sister', 'impersonation'), filed('r1', 'a', at(300), '  A third account made to message me ')], 'mod')
    expect(words).toEqual([
      { id: 'r1', reason: 'other', details: 'A third account made to message me' },
      { id: 'r2', reason: 'impersonation', details: 'Pretending to be my sister' },
    ])
    expect(JSON.stringify(words)).not.toMatch(/"a"|"b"|writer/)
  })

  it('leaves out reports from before the last decision, which was made with them', () => {
    const words = reportDetails(item, [filed('old', 'a', at(150), 'Read already'), filed('same', 'a', at(200), 'Read already too'), filed('new', 'a', at(200, 1), 'New since')], 'mod')
    expect(words.map((w) => w.id)).toEqual(['new'])
    // With no decision yet, every one counted is in the round, even one with no time
    expect(reportDetails({ ...item, resolvedAt: undefined }, [filed('old', 'a', at(150), 'First'), filed('untimed', 'b', null, 'Second')], 'mod').map((w) => w.id)).toEqual(['old', 'untimed'])
    expect(reportDetails(item, [filed('untimed', 'b', null, 'Second')], 'mod')).toEqual([])
  })

  it('leaves out anyone the round doesn’t count, such as the writer or someone who couldn’t see it', () => {
    const words = reportDetails(item, [filed('w', 'writer', at(300), 'Ignore them'), filed('o', 'outsider', at(300), 'Not in the group'), filed('a', 'a', at(300), 'In the round')], 'mod')
    expect(words.map((w) => w.id)).toEqual(['a'])
    // Someone whose account has gone is taken off the item
    expect(reportDetails({ ...item, reports: { ...item.reports, reporterUids: ['b'] } }, [filed('a', 'a', at(300), 'Gone')], 'mod')).toEqual([])
  })

  it('leaves out reports with nothing written', () => {
    expect(reportDetails(item, [filed('none', 'a', at(300)), filed('blank', 'b', at(310), '   ')], 'mod')).toEqual([])
  })

  it('never reads them out to the person reported, even a moderator', () => {
    expect(readsReports(item, 'mod')).toBe(true)
    expect(readsReports(item, 'writer')).toBe(false)
    expect(reportDetails(item, [filed('a', 'a', at(300), 'About you')], 'writer')).toEqual([])
    // Held by automod alone: no reports, so nothing to read
    expect(readsReports({ authorUid: 'writer' }, 'mod')).toBe(false)
  })
})
