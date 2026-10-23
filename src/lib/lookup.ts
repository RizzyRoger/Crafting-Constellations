import { collection, documentId, limit, orderBy, query, startAt, where, type Firestore } from 'firebase/firestore'

// Opening one piece of writing that may have stopped being mine to read (withdrawn,
// removed). Its document is refused then, and a refused listen breaks this Firestore
// SDK (tasks/lessons.md). So is a query pinned to its id: the rules judge that as a
// read of the document. These order from its id instead, in shapes the rules allow
// any member whatever became of it, and return it or the next one along; findById
// tells which.

// The item if it's published
export const publishedFrom = (db: Firestore, collectionPath: string, id: string) =>
  query(collection(db, collectionPath), where('status', '==', 'published'), orderBy(documentId()), startAt(id), limit(1))

// The item if I wrote it, whatever its status
export const mineFrom = (db: Firestore, collectionPath: string, id: string, me: string) =>
  query(collection(db, collectionPath), where('authorUid', '==', me), orderBy(documentId()), startAt(id), limit(1))

// The row with this id, or null: the lookups above, and my connections or chats, hold others too
export const findById = <T extends { id: string }>(rows: T[], id: string): T | null => rows.find((row) => row.id === id) ?? null
