import { collection, collectionGroup, documentId, endAt, limit, orderBy, query, startAt, where, type Timestamp } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useSignOut } from '../auth/useSignOut'
import { personAddress } from '../constellation/personAddress'
import { CHOOSE } from '../constellation/sheetReveal'
import { CheckIn, useCheckInDraft } from './CheckIn'
import { CHECKIN_GROUP, checkInJoin, promptFits } from '../lib/checkin'
import { db } from '../lib/firebase'
import { focusForNow } from '../lib/focusForNow'
import { useDocData, useQueryData } from '../lib/live'
import { otherInPair } from '../lib/pair'
import { penNameSearchTerm } from '../lib/penNameSearch'
import { visibleById, waitingOn } from '../lib/people'
import { hereOf } from '../lib/returnTo'
import { joinGroup } from '../lib/social'
import type { Chat, Connection, Group, Membership, Notice, Profile } from '../lib/types'
import { Blot } from '../wash/Blot'

interface ThreadRow {
  id: string
  uids: string[]
  lastMessageAt: Timestamp | null
}

const Disclosure = ({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
}) => (
  <details
    className="disc"
    open={open}
    onToggle={(event) => {
      const next = event.currentTarget.open
      if (next !== open) onToggle(next)
    }}
  >
    <summary>{label}</summary>
    <div className="disc__body">{children}</div>
  </details>
)

const Rail = () => {
  const { user, profile, claims } = useAuth()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const location = useLocation()
  const uid = user?.uid ?? null
  const verified = claims.emailVerified

  const [searchOpen, setSearchOpen] = useState(false)
  const [chatsOpen, setChatsOpen] = useState(() => /^\/(messages|chats)/.test(location.pathname))
  const [groupsOpen, setGroupsOpen] = useState(() => location.pathname.startsWith('/groups'))
  const [queryText, setQueryText] = useState('')

  useEffect(() => {
    if (/^\/(messages|chats)/.test(location.pathname)) setChatsOpen(true)
    if (location.pathname.startsWith('/groups')) setGroupsOpen(true)
  }, [location.pathname])

  const memberships = useQueryData<Membership & { id: string; path: string }>(uid && `rail-members|${uid}`, () =>
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
  )
  const groups = useQueryData<Group>(uid && 'rail-groups', () => collection(db, 'groups'))
  const notices = useQueryData<Notice>(uid && `rail-notices|${uid}`, () =>
    query(collection(db, `users/${uid}/notices`), where('seen', '==', false)),
  )
  const connections = useQueryData<Connection>(uid && `rail-conn|${uid}`, () =>
    query(collection(db, 'connections'), where('uids', 'array-contains', uid)),
  )
  const threads = useQueryData<ThreadRow>(uid && verified ? `rail-threads|${uid}` : null, () =>
    query(collection(db, 'dms'), where('uids', 'array-contains', uid)),
  )
  const chats = useQueryData<Chat>(uid && verified ? `rail-chats|${uid}` : null, () =>
    query(collection(db, 'chats'), where('uids', 'array-contains', uid)),
  )

  const myGroupIds = new Set(memberships.data.map((m) => m.path.split('/')[1]))
  const myGroups = groups.data.filter((g) => myGroupIds.has(g.id)).sort((a, b) => a.name.localeCompare(b.name))
  const myChats = [...chats.data].sort((a, b) => a.name.localeCompare(b.name))
  // Who's asking to connect, read so anyone banned since drops out of the count (one `in` query holds 30)
  const askerIds = useMemo(() => {
    if (!uid) return []
    const asking = connections.data.filter((c) => c.status === 'pending' && c.recipient === uid).map((c) => c.requester)
    return [...new Set(asking)].sort().slice(0, 30)
  }, [connections.data, uid])
  const askers = useQueryData<Profile>(uid && askerIds.length ? `rail-askers|${askerIds.join(',')}` : null, () =>
    query(collection(db, 'users'), where(documentId(), 'in', askerIds)),
  )
  const incoming = waitingOn(connections.data, visibleById(askers.data), uid ?? '').length
  const unread = notices.data.length + incoming
  const partnerIds = useMemo(() => {
    if (!uid) return []
    return [...new Set(threads.data.map((thread) => otherInPair(thread.id, uid)).filter(Boolean))].sort().slice(0, 30)
  }, [threads.data, uid])
  const partners = useQueryData<Profile>(uid && partnerIds.length ? `rail-partners|${partnerIds.join(',')}` : null, () =>
    query(collection(db, 'users'), where(documentId(), 'in', partnerIds)),
  )
  // Tidied as pen names are stored, so a phone's curly apostrophe still finds O'Neil
  const needle = penNameSearchTerm(queryText)
  const search = useQueryData<Profile>(uid && needle ? `rail-search|${needle}` : null, () =>
    query(collection(db, 'users'), orderBy('penNameLower'), startAt(needle), endAt(`${needle}\uf8ff`), limit(8)),
  )
  const byId = useMemo(() => new Map(partners.data.map((p) => [p.id, p])), [partners.data])
  const matches = search.data.filter((p) => !p.banned && p.id !== uid)

  const sortedThreads = [...threads.data].sort((a, b) => (b.lastMessageAt?.toMillis() ?? 0) - (a.lastMessageAt?.toMillis() ?? 0))

  return (
    <aside className="rail" aria-label="Index">
      <NavLink to="/notifications" className="rail__notify" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}>
        Notifications
        {unread > 0 && <span className="rail__count code">{unread}</span>}
      </NavLink>
      <div className="rail__browse">
      <Disclosure label="Search for user" open={searchOpen} onToggle={setSearchOpen}>
        <input
          className="disc__search"
          type="search"
          value={queryText}
          placeholder="Pen name"
          aria-label="Search for user"
          onChange={(event) => setQueryText(event.target.value)}
        />
        {needle && !search.loading && matches.length === 0 && <p className="disc__empty">No one by that name.</p>}
        <ul className="disc__list">
          {matches.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => {
                  // Marked as a choice, so choosing whoever is open already still brings their sheet
                  // up; the same address again replaces itself rather than adding history
                  const to = personAddress(location, person.id)
                  navigate(to, { replace: to === location.pathname + location.search, state: CHOOSE })
                  setQueryText('')
                }}
              >
                {person.penName}
              </button>
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure label="Private chats" open={chatsOpen} onToggle={setChatsOpen}>
        {!verified ? (
          <Link to="/verify" state={{ from: hereOf(location) }} className="disc__empty">
            Confirm email to open chats
          </Link>
        ) : sortedThreads.length === 0 && myChats.length === 0 ? (
          <Link to="/constellation" className="disc__empty">
            No conversations yet.
          </Link>
        ) : (
          <ul className="disc__list">
            {sortedThreads.map((thread) => {
              const other = byId.get(otherInPair(thread.id, uid ?? ''))
              return (
                <li key={thread.id}>
                  <NavLink to={`/messages/${thread.id}`}>{other?.penName ?? 'Someone'}</NavLink>
                </li>
              )
            })}
            {myChats.map((chat) => (
              <li key={chat.id}>
                <NavLink to={`/chats/${chat.id}`}>{chat.name}</NavLink>
              </li>
            ))}
          </ul>
        )}
        {verified && (
          <Link to="/chats/new" className="disc__empty">
            Start a private group chat
          </Link>
        )}
      </Disclosure>

      <Disclosure label="Group Chats" open={groupsOpen} onToggle={setGroupsOpen}>
        {myGroups.length === 0 ? (
          <Link to="/constellation?view=groups" className="disc__empty">
            No groups yet.
          </Link>
        ) : (
          <ul className="disc__list">
            {myGroups.map((group) => (
              <li key={group.id}>
                <NavLink to={`/groups/${group.id}`}>{group.name}</NavLink>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
      </div>

      <div className="rail__foot">
        {profile && (
          <Link to="/me" className="rail__me">
            <Blot seed={profile.avatarSeed} pigment={profile.pigment} size={28} />
            <span className="who__name">{profile.penName}</span>
          </Link>
        )}
        {!verified && (
          <Link to="/verify" state={{ from: hereOf(location) }} className="disc__empty">
            Confirm your email to write privately.
          </Link>
        )}
        <nav className="rail__quiet" aria-label="Also">
          <Link to="/constellation">Chart</Link>
          <Link to="/professional">Professionals</Link>
          {claims.admin && <Link to="/admin">Review</Link>}
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>
      </div>
    </aside>
  )
}

// Everyone belongs to Daily check-in. Leaving lasts only until the next visit.
const JoinCheckIn = () => {
  const { user, profile } = useAuth()
  const uid = user?.uid ?? null
  const group = useDocData<{ name: string }>(uid && profile ? `groups/${CHECKIN_GROUP}` : null)
  const membership = useDocData<{ uid: string }>(uid && profile ? `groups/${CHECKIN_GROUP}/members/${uid}` : null)
  const decided = useRef(false)

  useEffect(() => {
    if (!uid || !profile) return
    const step = checkInJoin(decided.current, group, membership)
    if (step === 'wait') return
    decided.current = true
    // A refused join is refused again at once, so it waits for the next visit
    if (step === 'join') void joinGroup(CHECKIN_GROUP, uid).catch(() => {})
    // group and membership are new objects each render; these are what they hold
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, profile, group.loading, group.data, membership.loading, membership.data, membership.pending])

  return null
}

export const Shell = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const [later, setLater] = useState(false)
  // Kept here, where it lasts from page to page: what was typed in the prompt, or what it sent and
  // became, is still there after a page that leaves the prompt out. It goes with the person, since
  // the gate takes the shell down when who's signed in changes
  const draft = useCheckInDraft()
  const main = useRef<HTMLElement>(null)

  // The prompt's focused button goes with it, so focus comes to the page instead of falling out
  const setAside = () => {
    if (main.current) focusForNow(main.current)
    setLater(true)
  }

  return (
    <div className="shell">
      <Rail />
      <main className="shell__main" id="main" ref={main}>
        <JoinCheckIn />
        {!later && promptFits(location.pathname) && <CheckIn prompt draft={draft} onLater={setAside} />}
        {children}
      </main>
    </div>
  )
}
