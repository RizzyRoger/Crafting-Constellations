import { initializeApp } from 'firebase/app'
import { doc, getFirestore } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { publishedFrom } from './lookup'
import { isPlainId } from './routeIds'

// The real SDK, never connected: building a path or a query is local, and it's what throws
const db = getFirestore(initializeApp({ projectId: 'demo-route-ids' }, 'route-ids'))
const opens = (id: string) => {
  try {
    doc(db, `groups/g1/posts/${id}`)
    publishedFrom(db, 'groups/g1/posts', id)
    return true
  } catch {
    return false
  }
}

describe('isPlainId', () => {
  it('takes the ids Firestore makes, and they open', () => {
    for (const id of ['g1', 'Xq3k9VbT2mLp8RwY1nZa', 'synth03_synth04']) {
      expect(isPlainId(id), id).toBe(true)
      expect(opens(id), id).toBe(true)
    }
  })

  it('refuses an encoded slash or nothing at all, which throw instead of saying not found', () => {
    for (const id of ['a/b', 'a/b/c', 'a//b', '/', '']) {
      expect(isPlainId(id), id).toBe(false)
      expect(opens(id), id).toBe(false)
    }
  })
})
