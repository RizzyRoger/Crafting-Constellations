import { pairIdOf } from './pair'

// Where a piece of writing lives, read from its path
export type Place =
  | { kind: 'post'; groupId: string; postId: string }
  | { kind: 'comment'; groupId: string; postId: string }
  | { kind: 'groupMessage'; groupId: string }
  | { kind: 'chatMessage'; chatId: string }

export const placeOf = (path: string | undefined): Place | null => {
  const s = path?.split('/') ?? []
  if (s[0] === 'groups' && s[2] === 'posts' && s.length === 4) return { kind: 'post', groupId: s[1], postId: s[3] }
  if (s[0] === 'groups' && s[2] === 'posts' && s[4] === 'comments' && s.length === 6) return { kind: 'comment', groupId: s[1], postId: s[3] }
  if (s[0] === 'groups' && s[2] === 'messages' && s.length === 4) return { kind: 'groupMessage', groupId: s[1] }
  if (s[0] === 'chats' && s[2] === 'messages' && s.length === 4) return { kind: 'chatMessage', chatId: s[1] }
  return null
}

// The parts of a Notice (types.ts) these read; kept structural so tests needn't load the DOM types
interface Linkable {
  type: string
  contentPath?: string
  actorUid?: string
}

// Where opening a notification takes you; null for notes that are only read, and for
// a chat you're no longer in (`readable` false), which has no way back in. A group
// still opens: anyone can join it again
export const linkFor = (notice: Linkable, me: string, readable?: boolean): string | null => {
  if (notice.type === 'accepted') return notice.actorUid ? `/messages/${pairIdOf(me, notice.actorUid)}` : null
  if (notice.type !== 'mention' && notice.type !== 'comment') return null
  const place = placeOf(notice.contentPath)
  if (!place) return null
  if (place.kind === 'groupMessage') return `/groups/${place.groupId}`
  if (place.kind === 'chatMessage') return readable === false ? null : `/chats/${place.chatId}`
  return `/groups/${place.groupId}/posts/${place.postId}`
}

// What happened, said after the person's pen name
export const verbFor = (notice: Linkable, placeName?: string): string => {
  if (notice.type === 'accepted') return 'accepted your request. You can write to each other now.'
  const place = placeOf(notice.contentPath)
  const where = placeName ?? (place?.kind === 'chatMessage' ? 'a private chat' : 'a group')
  if (notice.type === 'comment') return `commented on your post in ${where}`
  if (place?.kind === 'post') return `mentioned you in a post in ${where}`
  if (place?.kind === 'comment') return `mentioned you in a comment in ${where}`
  return `mentioned you in ${where}`
}
