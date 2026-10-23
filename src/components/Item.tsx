import { useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { isFirstClick } from '../lib/groupStanding'
import { ago } from '../lib/time'
import type { AuthorSnapshot, Content } from '../lib/types'
import { canWithdraw, withdraw } from '../lib/withdraw'
import { Blot } from '../wash/Blot'
import { CrisisCard } from './CrisisCard'
import { Report } from './Report'
import { StatusNote } from './StatusNote'
import { Licensed, Who } from './Who'

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
  const [refused, setRefused] = useState<string | null>(null)
  const mine = item.authorUid === me
  const author: AuthorSnapshot | undefined =
    item.author ?? (mine && profile ? { penName: profile.penName, avatarSeed: profile.avatarSeed, pigment: profile.pigment, pro: profile.pro } : undefined)

  const takeBack = async () => {
    setRefused(null)
    setRefused(await withdraw(item.path))
  }

  const foot = (
    <div className="item__actions">
      {actions}
      {mine ? (
        // Already withdrawn or removed: the rules refuse it again
        canWithdraw(item.status) && (
          // Withdrawn writing drops out of the list at once, so only a first click (or a key) acts: the
          // second click of a double-click would land on the next of mine and take it back for good
          <button
            type="button"
            className="link-btn"
            onClick={(e) => {
              if (isFirstClick(e.detail)) void takeBack()
            }}
          >
            Withdraw
          </button>
        )
      ) : (
        item.status === 'published' && <Report contentPath={item.path} me={me} />
      )}
      {refused && (
        <span className="error" role="alert">
          {refused}
        </span>
      )}
    </div>
  )

  const crisis = (
    <>
      {/* Undelivered writing never reaches others, so its card keeps the resources but not 'before others see it' */}
      {mine && item.status === 'held' && item.heldReason === 'crisis' && <CrisisCard audience="writer" held={!item.undelivered} />}
      {privateThread && item.crisis && <CrisisCard audience={mine ? 'writer' : 'reader'} />}
    </>
  )

  // The blot is decorative, so talk and comments name the writer in words too
  const who = author ? <Who person={author} showBlot={false} /> : <span className="who__name">Someone</span>
  const blot = author ? (
    <Blot seed={author.avatarSeed} pigment={author.pigment} size={blotSize} />
  ) : (
    <span className="bubble__fallback" aria-hidden="true" />
  )

  if (variant === 'bubble') {
    return (
      <article className={`bubble ${mine ? 'bubble--out' : 'bubble--in'} item--${item.status} ${className}`}>
        {blot}
        <div className="bubble__box">
          {/* My bubbles sit on the right without my name; a screen reader hears it instead */}
          {mine && <span className="visually-hidden">You</span>}
          <div className="item__head">
            {mine ? author?.pro && <Licensed /> : who}
            {mine && <StatusNote item={item} />}
          </div>
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
        {blot}
        <div className="comment-row__bar">
          <div className="item__head">
            {who}
            {mine && <StatusNote item={item} />}
          </div>
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
