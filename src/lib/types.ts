import type { Timestamp } from 'firebase/firestore'
import type { Pigment } from '../wash/pigments'

export type Status = 'pending' | 'published' | 'held' | 'removed' | 'withdrawn'

export interface AuthorSnapshot {
  penName: string
  avatarSeed: string
  pigment: Pigment | string
  pro: boolean
  synthetic?: boolean
}

export interface Profile {
  id: string
  penName: string
  penNameLower?: string
  note?: string
  avatarSeed: string
  pigment: Pigment | string
  pro: boolean
  banned: boolean
  synthetic?: boolean
}

export interface Content {
  id: string
  path: string
  authorUid: string
  status: Status
  createdAt: Timestamp | null
  author?: AuthorSnapshot
  heldReason?: 'crisis' | 'review'
  // Held for good: it can't reach them (no longer connected, or its writer's account paused).
  // Set by functions as it arrives or when a moderator approves it
  undelivered?: boolean
  crisis?: boolean
  // People pinged with @, checked and attached by functions on publish
  mentioned?: { uid: string; penName: string }[]
}

export interface Message extends Content {
  text: string
}

export interface Post extends Content {
  title?: string
  body: string
  likeCount?: number
  commentCount?: number
}

export interface Comment extends Content {
  text: string
}

export interface Constellation {
  id: string
  name: string
  description?: string
  order?: number
}

export interface Group {
  id: string
  name: string
  description?: string
  constellationId: string
  constellationName: string
  memberCount?: number
}

export interface Membership {
  groupId: string
  uid: string
}

export interface Connection {
  id: string
  uids: [string, string]
  requester: string
  recipient: string
  status: 'pending' | 'accepted' | 'blocked'
  blockedBy?: string
}

// A private group chat among people the creator is connected with
export interface Chat {
  id: string
  name: string
  uids: string[]
  createdBy: string
  lastMessageAt: Timestamp | null
}

export interface Notice {
  id: string
  type: 'crisis' | 'held' | 'removed' | 'proApproved' | 'proDenied' | 'mention' | 'comment' | 'accepted'
  // The writing it's about; for 'removed', users/{uid} when a moderator reset their profile instead
  contentPath?: string
  // When that writing was made: how the page finds it again (mention / comment)
  contentAt?: Timestamp
  note?: string
  // Who pinged, commented or accepted (mention / comment / accepted)
  actorUid?: string
  actor?: AuthorSnapshot
  createdAt: Timestamp | null
  seen: boolean
}

export interface QueueItem {
  id: string
  contentPath: string
  kind: 'post' | 'comment' | 'groupMessage' | 'dm' | 'chatMessage' | 'profile'
  groupId?: string
  pairId?: string
  chatId?: string
  authorUid: string
  authorPenName: string
  snapshot: { title?: string; text: string }
  automod?: { categories: string[]; crisis: boolean; matches: { category: string; term: string }[] }
  // The reports since a moderator last decided; reporterUids are who they came from, never shown
  reports?: { count: number; reasons: string[]; reporterUids?: string[] }
  delivered?: boolean
  priority: number
  state: 'open' | 'resolved'
  createdAt: Timestamp | null
  // When a moderator last decided on it, if it has come back since
  resolvedAt?: Timestamp | null
}

// A report as filed (Report.tsx). Only moderators can read them
export interface FiledReport {
  id: string
  reporterUid: string
  contentPath: string
  reason: string
  // What they wrote under 'Anything else'
  details?: string
  createdAt: Timestamp | null
}

export interface ProApplication {
  uid: string
  status: 'submitted' | 'approved' | 'denied' | 'revoked'
  legalName: string
  licenseType: string
  licenseRegion: string
  licenseNumber: string
  statement?: string
  files: string[]
  submittedAt: Timestamp | null
  // The last decision's time, which names a reapplication's folder (reapplyRound)
  reviewedAt?: Timestamp | null
  reviewNote?: string
}
