import { collection, collectionGroup, doc, limit, orderBy, query, updateDoc, where, writeBatch, type Timestamp } from 'firebase/firestore'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { CrisisCard } from '../components/CrisisCard'
import { MentionText } from '../components/MentionText'
import { PageHead } from '../components/PageHead'
import { Who } from '../components/Who'
import { describeError } from '../lib/callables'
import { db } from '../lib/firebase'
import { isFirstClick } from '../lib/groupStanding'
import { useQueryData } from '../lib/live'
import { inBatches, withUnseen } from '../lib/noticeList'
import { linkFor, placeOf, verbFor } from '../lib/notifications'
import { otherInPair } from '../lib/pair'
import { visibleById, waitingOn } from '../lib/people'
import { hereOf } from '../lib/returnTo'
import { acceptConnection, removeConnection } from '../lib/social'
import { ago } from '../lib/time'
import type { Chat, Connection, Content, Group, Notice, Profile } from '../lib/types'

// Notes from moderators and the review of a licence (no one person behind them)
const NOTE_TEXT: Partial<Record<Notice['type'], string>> = {
  crisis: 'Something you wrote sounded heavy. The resources below are always here.',
  held: 'Something you wrote is waiting for a person to read it.',
  removed: 'A moderator removed something you wrote, because it didn’t fit the group’s guidelines.',
  proApproved: 'Your licence was checked. The circled “licensed” mark now appears next to your pen name.',
  proDenied: 'Your professional application wasn’t approved this time.',
}

// A moderator's Reset profile is told as 'removed' too, pointing at the profile (users/{uid}), not at writing.
// It retires the reported name unless someone else holds it by then, and frees one they renamed to since
// (resetNames in functions/src/profilePolicy.ts), so the note promises nothing about either
const RESET_NOTE = (
  <>
    A moderator reset your pen name and note, because they didn’t fit the community’s guidelines. The name that was reported may not be
    available again. You can choose a new one on <Link to="/me">You</Link>.
  </>
)

const noteFor = (notice: Notice) =>
  notice.type === 'removed' && /^users\/[^/]+$/.test(notice.contentPath ?? '') ? RESET_NOTE : NOTE_TEXT[notice.type]

const EXCERPT = 160

// The newest notices loaded at once; unseen ones older than these follow, up to as many again
const PAGE = 50

type Pointed = Content & { title?: string; body?: string; text?: string }

// The words a notification points at, read live. Asked as "published, at this time, in a
// place I can still read": a query the rules always allow. (Reading the document itself is
// refused once it's withdrawn, and a refused listen breaks this Firestore SDK; see
// tasks/lessons.md. So is a query pinned to its id: the rules judge that as a read.)
const Excerpt = ({ path, at, me }: { path: string; at: Timestamp; me: string }) => {
  const cut = path.lastIndexOf('/')
  const found = useQueryData<Pointed>(`excerpt|${path}|${at.toMillis()}`, () =>
    query(collection(db, path.slice(0, cut)), where('status', '==', 'published'), where('createdAt', '==', at)),
  )
  if (found.loading) return null
  const item = found.data.find((d) => d.path === path)
  if (!item) return <p className="meta">No longer here.</p>
  const words = [item.title, item.body ?? item.text].filter(Boolean).join(' — ')
  return (
    <MentionText className="voice notice__excerpt" text={words.length > EXCERPT ? `${words.slice(0, EXCERPT)}…` : words} mentioned={item.mentioned} me={me} />
  )
}

const markSeen = (me: string, notice: Notice) => {
  if (!notice.seen) void updateDoc(doc(db, `users/${me}/notices/${notice.id}`), { seen: true })
}

interface RowProps {
  notice: Notice
  me: string
  placeName?: string
  // Still in the group or chat it points at: true, false, or not known yet
  readable?: boolean
}

const NoticeRow = ({ notice, me, placeName, readable }: RowProps) => {
  const note = noteFor(notice)
  const unread = notice.seen ? '' : ' · new'

  if (note) {
    return (
      <li className={notice.seen ? 'notice' : 'notice notice--unread'}>
        <p className="pencil note">{note}</p>
        {notice.note && <p className="meta">Note from the moderator: {notice.note}</p>}
        <span className="meta">
          {ago(notice.createdAt)}
          {unread}
        </span>
        {/* Kept after it's read, as the note promises: once a moderator has read held writing, nothing else shows these */}
        {notice.type === 'crisis' && <CrisisCard audience="writer" />}
      </li>
    )
  }

  const href = linkFor(notice, me, readable)
  const body = (
    <>
      <span className="notice__line">
        {notice.actor ? <Who person={notice.actor} /> : <span className="who__name">Someone</span>}
        <span className="pencil note">{verbFor(notice, placeName)}</span>
      </span>
      {notice.contentPath && notice.contentAt && readable && <Excerpt path={notice.contentPath} at={notice.contentAt} me={me} />}
      {notice.contentPath && readable === false && <p className="meta">You’re no longer in this group or chat.</p>}
      <span className="meta">
        {ago(notice.createdAt)}
        {unread}
      </span>
    </>
  )

  return (
    <li className={notice.seen ? 'notice' : 'notice notice--unread'}>
      {href ? (
        <Link to={href} className="notice__open" onClick={() => markSeen(me, notice)}>
          {body}
        </Link>
      ) : (
        <div className="notice__open">{body}</div>
      )}
    </li>
  )
}

export const Notifications = () => {
  const { uid, claims } = useMe()
  const location = useLocation()
  const verified = claims.emailVerified
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const notices = useQueryData<Notice>(`notices|${uid}`, () =>
    query(collection(db, `users/${uid}/notices`), orderBy('createdAt', 'desc'), limit(PAGE)),
  )
  // Every unseen one, as the rail counts them, so none can be left past the newest page
  const unseen = useQueryData<Notice>(`unseen-notices|${uid}`, () =>
    query(collection(db, `users/${uid}/notices`), where('seen', '==', false)),
  )
  const connections = useQueryData<Connection>(`connections|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const groups = useQueryData<Group>('groups', () => collection(db, 'groups'))
  const chats = useQueryData<Chat>(verified ? `chats|${uid}` : null, () => query(collection(db, 'chats'), where('uids', 'array-contains', uid)))
  const memberships = useQueryData<{ path: string }>(`my-members|${uid}`, () => query(collectionGroup(db, 'members'), where('uid', '==', uid)))

  const byId = visibleById(people.data)
  const groupNames = new Map(groups.data.map((g) => [g.id, g.name]))
  const chatNames = new Map(chats.data.map((c) => [c.id, c.name]))
  const incoming = waitingOn(connections.data, byId, uid)
  const listed = withUnseen(notices.data, unseen.data, PAGE)
  const loading = notices.loading || unseen.loading || connections.loading

  const myGroupIds = new Set(memberships.data.map((m) => m.path.split('/')[1]))

  const placeName = (notice: Notice) => {
    const place = placeOf(notice.contentPath)
    if (!place) return undefined
    return place.kind === 'chatMessage' ? chatNames.get(place.chatId) : groupNames.get(place.groupId)
  }

  // Only read what the rules will allow; private chats need a confirmed email to read at all
  const readable = (notice: Notice) => {
    const place = placeOf(notice.contentPath)
    if (!place) return undefined
    if (place.kind === 'chatMessage') return verified && !chats.loading ? chatNames.has(place.chatId) : undefined
    return memberships.loading ? undefined : myGroupIds.has(place.groupId)
  }

  // Only a first click (or a key) acts. Answering a request drops its row at once, and the next
  // one slides up under the second click of a double-click
  const run = (id: string, work: () => Promise<unknown>) => async (e: { detail: number }) => {
    if (!isFirstClick(e.detail)) return
    setBusy(id)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const markAllRead = () =>
    Promise.all(
      inBatches(unseen.data).map((part) => {
        const batch = writeBatch(db)
        part.forEach((n) => batch.update(doc(db, `users/${uid}/notices/${n.id}`), { seen: true }))
        return batch.commit()
      }),
    )

  return (
    <>
      <PageHead
        title="Notifications"
        kicker="Joseph Z’s Cool Gray — granulating"
        lede="People who want to connect, anyone who mentions you, and replies to what you post."
        seed={47}
      />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {incoming.length > 0 && (
        <section className="section" aria-labelledby="waiting">
          <div className="section__head">
            <h2 id="waiting">Waiting for you</h2>
          </div>
          <ul className="ruled-list">
            {incoming.map((c) => {
              const person = byId.get(otherInPair(c.id, uid))
              return (
                <li key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                  {person ? <Who person={{ ...person, avatarSeed: person.avatarSeed || person.id }} /> : <span className="who__name">Someone</span>}
                  <span className="row">
                    <span className="meta">wants to connect</span>
                    {verified ? (
                      <button type="button" className="act act--quiet act--wash" disabled={busy === c.id} onClick={run(c.id, () => acceptConnection(c.id))}>
                        Accept
                      </button>
                    ) : (
                      <span className="hint">
                        <Link to="/verify" state={{ from: hereOf(location) }}>Confirm your email</Link> to accept.
                      </span>
                    )}
                    <button type="button" className="link-btn" disabled={busy === c.id} onClick={run(c.id, () => removeConnection(c.id))}>
                      Not now
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="latest">
        <div className="section__head">
          <h2 id="latest">Latest</h2>
          {unseen.data.length > 0 && (
            <button type="button" className="link-btn" disabled={busy === 'all'} onClick={run('all', markAllRead)}>
              Mark all read
            </button>
          )}
        </div>
        {loading ? null : listed.length === 0 ? (
          <p className="empty">Nothing yet. When someone mentions you, comments on your post, or accepts your request, it shows here.</p>
        ) : (
          <ul className="ruled-list">
            {listed.map((n) => (
              <NoticeRow key={n.id} notice={n} me={uid} placeName={placeName(n)} readable={readable(n)} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
