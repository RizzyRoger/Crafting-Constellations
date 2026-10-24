import { tidyPenName } from './moderation/index.js'

// Firebase-free rules for pen names (saveProfile, and a moderator's Reset profile), kept
// apart so they can be unit tested

// penNames/{lower}: { uid } while someone goes by the name, { retired: true } once a
// moderator retired it (Reset profile)
export interface NameRecord {
  uid?: unknown
  retired?: unknown
}

// A rename frees the name it leaves only while that name is still the person's own:
// never a retired record, the only thing keeping a reported name from being taken
// back, and never a claim someone else holds
export const mayRelease = (record: NameRecord | undefined, uid: string) => record?.retired !== true && record?.uid === uid

// Reset profile retires the name the moderator was shown, as the profile was reported,
// even if the person has renamed since. A queue item that kept no name falls back to
// the name they go by now. Keys are kept as saveProfile keeps them (penNameLower)
export const reportedName = (shown: unknown, current: string | undefined) =>
  (typeof shown === 'string' ? tidyPenName(shown).toLowerCase() : '') || current

// Nobody else holds it: still theirs, already retired, or left with no record by a rename
const mayRetire = (record: NameRecord | undefined, uid: string) => record?.uid === undefined || record.uid === uid

// What Reset profile does with each name, as it moves the person to a generated one. The
// reported name is retired, unless someone else has taken it since. The name they go by
// now, if it's another, was never judged: it's freed, as a rename frees the name it leaves
export const resetNames = (uid: string, reported: string | undefined, current: string | undefined, records: ReadonlyMap<string, NameRecord | undefined>) => ({
  retire: reported !== undefined && mayRetire(records.get(reported), uid) ? reported : undefined,
  free: current !== undefined && current !== reported && mayRelease(records.get(current), uid) ? current : undefined,
})
