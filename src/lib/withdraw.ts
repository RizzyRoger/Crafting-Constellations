import { doc, updateDoc } from 'firebase/firestore'
import { describeError } from './callables'
import { db } from './firebase'
import type { Status } from './types'

// The rules take writing back only while it's pending, published or held (isWithdrawal)
const WITHDRAWABLE: ReadonlySet<Status> = new Set(['pending', 'published', 'held'])

export const canWithdraw = (status: Status) => WITHDRAWABLE.has(status)

// Takes my writing back. Resolves to why it couldn't, or null: a refusal is shown by
// the button, not lost in the console
export const withdraw = async (path: string): Promise<string | null> => {
  try {
    await updateDoc(doc(db, path), { status: 'withdrawn' })
    return null
  } catch (error) {
    return describeError(error)
  }
}
