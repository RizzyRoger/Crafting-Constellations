// Firebase-free rules for saveProfile's pen names, kept apart so they can be unit tested

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
