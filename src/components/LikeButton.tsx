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

  return (
    <button type="button" className="link-btn" aria-pressed={liked} disabled={busy} onClick={() => void toggle()}>
      {liked ? 'Liked' : 'Like'}
      {count > 0 ? ` · ${Math.max(0, count)}` : ''}
    </button>
  )
}
