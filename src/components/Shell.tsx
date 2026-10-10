import { collection, collectionGroup, query, where, type Timestamp } from 'firebase/firestore'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useSignOut } from '../auth/useSignOut'
import { db } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import { otherInPair } from '../lib/pair'
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
  const [chatsOpen, setChatsOpen] = useState(() => location.pathname.startsWith('/messages'))
  const [groupsOpen, setGroupsOpen] = useState(() => /^\/(groups|chats)/.test(location.pathname))
  const [queryText, setQueryText] = useState('')

  useEffect(() => {
    if (location.pathname.startsWith('/messages')) setChatsOpen(true)
    if (/^\/(groups|chats)/.test(location.pathname)) setGroupsOpen(true)
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
  const people = useQueryData<Profile>(uid && 'rail-people', () => collection(db, 'users'))
  const threads = useQueryData<ThreadRow>(uid && verified ? `rail-threads|${uid}` : null, () =>
    query(collection(db, 'dms'), where('uids', 'array-contains', uid)),
  )
  const chats = useQueryData<Chat>(uid && verified ? `rail-chats|${uid}` : null, () =>
    query(collection(db, 'chats'), where('uids', 'array-contains', uid)),
  )

  const myGroupIds = new Set(memberships.data.map((m) => m.path.split('/')[1]))
  const myGroups = groups.data.filter((g) => myGroupIds.has(g.id)).sort((a, b) => a.name.localeCompare(b.name))
  const myChats = [...chats.data].sort((a, b) => a.name.localeCompare(b.name))
  const incoming = connections.data.filter((c) => c.status === 'pending' && c.recipient === uid).length
  const unread = notices.data.length + incoming
  const byId = useMemo(() => new Map(people.data.map((p) => [p.id, p])), [people.data])

  const needle = queryText.trim().toLowerCase()
  const matches =
    needle.length === 0
      ? []
      : people.data
          .filter((p) => !p.banned && p.id !== uid && (p.penNameLower ?? p.penName).toLowerCase().includes(needle))
          .slice(0, 8)

  const sortedThreads = [...threads.data].sort((a, b) => (b.lastMessageAt?.toMillis() ?? 0) - (a.lastMessageAt?.toMillis() ?? 0))

  return (
    <aside className="rail" aria-label="Index">
      <NavLink to="/notifications" className="rail__notify" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}>
        Notifications
        {unread > 0 && <span className="rail__count code">{unread}</span>}
      </NavLink>

      <Disclosure label="Search for user" open={searchOpen} onToggle={setSearchOpen}>
        <input
          className="disc__search"
          type="search"
          value={queryText}
          placeholder="Pen name"
          aria-label="Search for user"
          onChange={(event) => setQueryText(event.target.value)}
        />
        {needle && matches.length === 0 && <p className="disc__empty">No one by that name.</p>}
        <ul className="disc__list">
          {matches.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => {
                  navigate(`/constellation?person=${person.id}`)
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
          <Link to="/verify" className="disc__empty">
            Confirm email to open chats
          </Link>
        ) : sortedThreads.length === 0 ? (
          <p className="disc__empty">No conversations yet.</p>
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
          </ul>
        )}
      </Disclosure>

      <Disclosure label="Group Chats" open={groupsOpen} onToggle={setGroupsOpen}>
        {myGroups.length === 0 && myChats.length === 0 ? (
          <p className="disc__empty">No groups yet.</p>
        ) : (
          <ul className="disc__list">
            {myGroups.map((group) => (
              <li key={group.id}>
                <NavLink to={`/groups/${group.id}`}>{group.name}</NavLink>
              </li>
            ))}
            {myChats.map((chat) => (
              <li key={chat.id}>
                <NavLink to={`/chats/${chat.id}`}>
                  {chat.name} <span className="code">· private</span>
                </NavLink>
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

      <div className="rail__foot">
        {profile && (
          <Link to="/me" className="rail__me">
            <Blot seed={profile.avatarSeed} pigment={profile.pigment} size={28} />
            <span className="who__name">{profile.penName}</span>
          </Link>
        )}
        {!verified && (
          <Link to="/verify" className="disc__empty">
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

export const Shell = ({ children }: { children: ReactNode }) => (
  <div className="shell">
    <Rail />
    <main className="shell__main" id="main">
      {children}
    </main>
  </div>
)
