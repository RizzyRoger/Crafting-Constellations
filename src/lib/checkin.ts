import type { Timestamp } from 'firebase/firestore'

// Fixed id, also written by scripts/seed.ts. The live project needs this group before anyone can post.
export const CHECKIN_GROUP = 'daily-check-in'

export const CHECKIN_QUESTIONS = [
  { id: 'feeling', label: 'How are you feeling today?' },
  { id: 'mind', label: 'Is there anything on your mind right now?' },
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
