import type { Timestamp } from 'firebase/firestore'
import type { Status } from './types'

// Fixed id, also written by scripts/seed.ts. The live project needs this group before anyone can post.
export const CHECKIN_GROUP = 'daily-check-in'

// A question's words sit straight after the answer above it in the post, and moderation reads the
// post as one text, so no label starts with a word that would read as the answer carrying on
// ("Is", "I", "It's"): an ordinary answer about treatment was held as crisis because of it.
export const CHECKIN_QUESTIONS = [
  { id: 'feeling', label: 'How are you feeling today?' },
  { id: 'mind', label: 'Anything on your mind right now?' },
  { id: 'steps', label: 'What steps do you think you should take to get that off your mind?' },
] as const

export type CheckInId = (typeof CHECKIN_QUESTIONS)[number]['id']

export const checkInTitle = (date = new Date()) => date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

export const checkInBody = (answers: Record<CheckInId, string>) =>
  CHECKIN_QUESTIONS.map((q) => `${q.label}\n${answers[q.id].trim()}`).join('\n\n')

export const isToday = (ts: Timestamp | null | undefined) => {
  if (!ts) return false
  const day = ts.toDate()
  const now = new Date()
  return day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate()
}

// Withdrawn or removed writing is gone, so the form comes back for another go today
const GONE: ReadonlySet<Status> = new Set(['withdrawn', 'removed'])

// Today's check-in among my newest posts in the group, newest first. Held still counts: it's
// still there, and I see it with its status
export const todaysCheckIn = <T extends { status: Status; createdAt: Timestamp | null }>(posts: readonly T[]) =>
  posts.find((post) => !GONE.has(post.status) && isToday(post.createdAt))

// Above other pages the prompt steps aside for a check-in written earlier or elsewhere, but stays
// with the one just sent from it, to say what became of it
export const promptHides = (today: { id: string } | undefined, sent: string | null) => today !== undefined && today.id !== sent

interface Answer {
  loading: boolean
  data: unknown
}

// The shell's join decides once a visit, on the first membership answer the server has: join only
// if there is none. One that goes later (a leave, or the account being deleted in another tab) is
// never put back, so leaving lasts until the next visit
export const checkInJoin = (decided: boolean, group: Answer, membership: Answer & { pending: boolean }) => {
  if (decided) return 'done'
  if (group.loading || !group.data || membership.loading || membership.pending) return 'wait'
  return membership.data ? 'done' : 'join'
}

// Pages that fill the shell (a group's talk and posts, private group chats, private notes) have no
// room above them, and You has its own check-in. Routes match without regard to case
const NO_PROMPT = [/^\/me\/?$/i, /^\/groups\/[^/]+\/?$/i, /^\/chats\/(?!new\/?$)[^/]+\/?$/i, /^\/messages\/[^/]+\/?$/i]

export const promptFits = (pathname: string) => !NO_PROMPT.some((page) => page.test(pathname))
