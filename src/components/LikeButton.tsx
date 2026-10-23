import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useState } from 'react'
import { db } from '../lib/firebase'
import { useDocData } from '../lib/live'

// One like per person (the like doc id is your uid). Count stays quiet.
export const LikeButton = ({ postPath, me, count = 0 }: { postPath: string; me: string; count?: number }) => {
  const like = useDocData<{ uid: string }>(`${postPath}/likes/${me}`)
  const [busy, setBusy] = useState(false)
  const liked = Boolean(like.data)

  const toggle = async () => {
    setBusy(true)
    try {
      const ref = doc(db, `${postPath}/likes/${me}`)
      if (liked) await deleteDoc(ref)
      else await setDoc(ref, { uid: me, createdAt: serverTimestamp() })
    } finally {
      setBusy(false)
    }
  }

  // The count is in the name, since a label hides any text inside. One name either way:
  // aria-pressed says whether it's yours
  const label = count > 0 ? `Like, ${count} ${count === 1 ? 'like' : 'likes'}` : 'Like'

  return (
    <button type="button" className={liked ? 'mark is-on' : 'mark'} aria-pressed={liked} aria-label={label} disabled={busy} onClick={() => void toggle()}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" />
      </svg>
    </button>
  )
}
