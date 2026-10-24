import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Index {
  collectionGroup: string
  queryScope: string
  fields: { fieldPath: string; order?: string; arrayConfig?: string }[]
}

const { indexes } = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')) as {
  indexes: Index[]
}

// Every query the app runs is on a collection, so only those indexes serve it
const deployed = indexes
  .filter((index) => index.queryScope === 'COLLECTION')
  .map((index) => {
    const fields = index.fields.map((field) => `${field.fieldPath} ${field.order ?? field.arrayConfig}`)
    return `${index.collectionGroup}: ${fields.join(', ')}`
  })

// useLiveContent (live.ts) runs the same two queries on posts, comments and
// messages: published ones and my own, both newest first. Its `direction`
// option only sorts the merged list on the client; the query is always desc.
const LIVE_CONTENT = ['posts', 'comments', 'messages'].flatMap((group) => [
  `${group}: status ASCENDING, createdAt DESCENDING`,
  `${group}: authorUid ASCENDING, createdAt DESCENDING`,
])

const NEEDED = [
  ...LIVE_CONTENT,
  // Admin.tsx: the open queue, most urgent first, then oldest first
  'modQueue: state ASCENDING, priority DESCENDING, createdAt ASCENDING',
  // Admin.tsx: submitted applications, oldest first
  'proApplications: status ASCENDING, submittedAt ASCENDING',
]

// The emulators don't check composite indexes, so a missing one only shows on
// the live project, where the listener fails with 'The query requires an index'
describe('firestore.indexes.json', () => {
  it.each(NEEDED)('has %s', (index) => {
    expect(deployed).toContain(index)
  })
})
