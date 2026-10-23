import { arrayRemove, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { blockOf } from './blocks'
import { db } from './firebase'
import { pairIdOf } from './pair'

// Connections ---------------------------------------------------------------

export const requestConnection = (me: string, other: string) => {
  const uids = [me, other].sort()
  return setDoc(doc(db, 'connections', pairIdOf(me, other)), {
    uids,
    requester: me,
    recipient: other,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export const acceptConnection = (pairId: string) =>
  updateDoc(doc(db, 'connections', pairId), { status: 'accepted', updatedAt: serverTimestamp() })

export const blockConnection = (pairId: string, me: string) =>
  updateDoc(doc(db, 'connections', pairId), { status: 'blocked', blockedBy: me, updatedAt: serverTimestamp() })

// Someone with no connection to you yet
export const blockPerson = (me: string, other: string) => {
  const block = blockOf(me, other)
  return setDoc(doc(db, 'connections', block.id), block.data)
}

// Decline, cancel, disconnect, or unblock
export const removeConnection = (pairId: string) => deleteDoc(doc(db, 'connections', pairId))

// Groups ------------------------------------------------------------------

export const joinGroup = (groupId: string, me: string) =>
  setDoc(doc(db, `groups/${groupId}/members/${me}`), { uid: me, joinedAt: serverTimestamp() })

export const leaveGroup = (groupId: string, me: string) => deleteDoc(doc(db, `groups/${groupId}/members/${me}`))

// Private group chats -------------------------------------------------------

// Created by the createChat function; anyone in one can take themself off it
export const leaveChat = (chatId: string, me: string) => updateDoc(doc(db, 'chats', chatId), { uids: arrayRemove(me) })
