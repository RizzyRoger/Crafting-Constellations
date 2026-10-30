import { describe, expect, it, vi } from 'vitest'
import { mirrorFriendship } from './friendships.js'

// The trigger's settings only: nothing here reaches Firestore
vi.mock('./app.js', () => ({ db: {}, snapshotOf: () => ({}) }))

describe('mirrorFriendship', () => {
  it('is retried when a run fails, so a block always takes its line off the constellation', () => {
    expect(mirrorFriendship.__endpoint.eventTrigger).toMatchObject({ eventFilterPathPatterns: { document: 'connections/{pairId}' }, retry: true })
  })
})
