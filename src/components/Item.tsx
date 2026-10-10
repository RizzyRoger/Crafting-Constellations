import { doc, updateDoc } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/firebase'
import { ago } from '../lib/time'
import type { AuthorSnapshot, Content } from '../lib/types'
import { CrisisCard } from './CrisisCard'
import { Report } from './Report'
import { StatusNote } from './StatusNote'
import { Who } from './Who'

interface ItemProps {
  item: Content
  me: string
  children: ReactNode
  actions?: ReactNode
  blotSize?: number
  className?: string
  // Private threads deliver crisis messages and show resources to both people
  privateThread?: boolean
}

// One piece of writing: who, when, its state, the words, and quiet actions
export const Item = ({ item, me, children, actions, blotSize = 24, className = '', privateThread = false }: ItemProps) => {
  const { profile } = useAuth()
  const mine = item.authorUid === me
  const author: AuthorSnapshot | undefined =
    item.author ?? (mine && profile ? { penName: profile.penName, avatarSeed: profile.avatarSeed, pigment: profile.pigment, pro: profile.pro } : undefined)

  const withdraw = () => updateDoc(doc(db, item.path), { status: 'withdrawn' })

  return (
    <article className={`item item--${item.status} ${className}`}>
      <div className="item__head">
        {author ? <Who person={author} size={blotSize} /> : <span className="who__name">Someone</span>}
        <span className="meta">{ago(item.createdAt)}</span>
        {mine && <StatusNote item={item} />}
      </div>
      {children}
      <div className="item__actions">
        {actions}
        {mine ? (
          <button type="button" className="link-btn" onClick={() => void withdraw()}>
            Withdraw
          </button>
        ) : (
          item.status === 'published' && <Report contentPath={item.path} me={me} />
        )}
      </div>
      {mine && item.status === 'held' && item.heldReason === 'crisis' && <CrisisCard audience="writer" held />}
      {privateThread && item.crisis && <CrisisCard audience={mine ? 'writer' : 'reader'} />}
    </article>
  )
}
