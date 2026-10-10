import { doc, updateDoc } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/firebase'
import { ago } from '../lib/time'
import type { AuthorSnapshot, Content } from '../lib/types'
import { Blot } from '../wash/Blot'
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
  variant?: 'plain' | 'bubble' | 'card' | 'comment'
  // Private threads deliver crisis messages and show resources to both people
  privateThread?: boolean
}

// One piece of writing: who, when, its state, the words, and quiet actions
export const Item = ({ item, me, children, actions, blotSize = 24, className = '', variant = 'plain', privateThread = false }: ItemProps) => {
  const { profile } = useAuth()
  const mine = item.authorUid === me
  const author: AuthorSnapshot | undefined =
    item.author ?? (mine && profile ? { penName: profile.penName, avatarSeed: profile.avatarSeed, pigment: profile.pigment, pro: profile.pro } : undefined)

  const withdraw = () => updateDoc(doc(db, item.path), { status: 'withdrawn' })

  const foot = (
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
  )

  const crisis = (
    <>
      {mine && item.status === 'held' && item.heldReason === 'crisis' && <CrisisCard audience="writer" held />}
      {privateThread && item.crisis && <CrisisCard audience={mine ? 'writer' : 'reader'} />}
    </>
  )

  if (variant === 'bubble') {
    return (
      <article className={`bubble ${mine ? 'bubble--out' : 'bubble--in'} item--${item.status} ${className}`}>
        {author ? (
          <Blot seed={author.avatarSeed} pigment={author.pigment} size={blotSize} />
        ) : (
          <span className="bubble__fallback" aria-hidden="true" />
        )}
        <div className="bubble__box">
          {children}
          {foot}
        </div>
        {crisis}
      </article>
    )
  }

  if (variant === 'card') {
    return (
      <article className={`post-card item--${item.status} ${className}`}>
        <div className="post-card__body">
          {author ? <Who person={author} size={blotSize} /> : <span className="who__name">Someone</span>}
          <span className="meta">{ago(item.createdAt)}</span>
          {mine && <StatusNote item={item} />}
          {children}
        </div>
        {foot}
        {crisis}
      </article>
    )
  }

  if (variant === 'comment') {
    return (
      <article className={`comment-row item--${item.status} ${className}`}>
        {author ? (
          <Blot seed={author.avatarSeed} pigment={author.pigment} size={blotSize} />
        ) : (
          <span className="bubble__fallback" aria-hidden="true" />
        )}
        <div className="comment-row__bar">
          {children}
          {foot}
        </div>
        {crisis}
      </article>
    )
  }

  return (
    <article className={`item item--${item.status} ${className}`}>
      <div className="item__head">
        {author ? <Who person={author} size={blotSize} /> : <span className="who__name">Someone</span>}
        <span className="meta">{ago(item.createdAt)}</span>
        {mine && <StatusNote item={item} />}
      </div>
      {children}
      {foot}
      {crisis}
    </article>
  )
}
