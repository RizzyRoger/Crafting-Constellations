import { serverTimestamp } from 'firebase/firestore'
import { pairIdOf } from './pair'

// A block on someone you have no connection with, such as a stranger in a group who keeps
// @mentioning you. It has the fields of a connection blocked later, so the person blocked
// learns no more than from any other block.
export const blockOf = (me: string, other: string) => ({
  id: pairIdOf(me, other),
  data: {
    uids: [me, other].sort(),
    requester: me,
    recipient: other,
    status: 'blocked',
    blockedBy: me,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  },
})

// How Block works from where two people stand: a request or a friendship turns into a block,
// and with nothing between them yet one is made outright. Once either has blocked, there's none.
// (A plain status, not Connection: the rules tests import this file, and ./types reaches browser-only code.)
export const howToBlock = (connection?: { status: string }): 'create' | 'update' | null => {
  if (!connection) return 'create'
  return connection.status === 'blocked' ? null : 'update'
}
