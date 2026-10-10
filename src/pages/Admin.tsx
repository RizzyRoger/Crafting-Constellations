import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { getBlob, ref } from 'firebase/storage'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Who } from '../components/Who'
import { approveContent, banUser, describeError, removeContent, reviewProfessional, setAdmin, unbanUser } from '../lib/callables'
import { db, storage } from '../lib/firebase'
import { useQueryData } from '../lib/live'
import { ago } from '../lib/time'
import type { ProApplication, Profile, QueueItem } from '../lib/types'

type Tab = 'queue' | 'pros' | 'people'

const KIND: Record<QueueItem['kind'], string> = {
  post: 'Group post',
  comment: 'Comment',
  groupMessage: 'Group talk',
  dm: 'Private note',
  profile: 'Profile',
}

const useAction = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<unknown>) => async () => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const QueueEntry = ({ item }: { item: QueueItem }) => {
  const { busy, error, run } = useAction()
  const [note, setNote] = useState('')
  const crisis = item.automod?.crisis || item.reports?.reasons.includes('selfHarm')
  const where = item.groupId ? (
    <Link to={`/groups/${item.groupId}`}>{item.groupId}</Link>
  ) : item.kind === 'dm' ? (
    'private thread'
  ) : (
    'profile'
  )

  return (
    <li className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="code">
          {crisis && <strong className="circled">crisis</strong>} {KIND[item.kind]} · {where} · {item.authorPenName || 'unknown'} · {ago(item.createdAt)}
        </span>
        <span className="meta">
          {item.automod ? `automod: ${item.automod.categories.join(', ')}` : ''}
          {item.reports ? ` reports: ${item.reports.count} (${item.reports.reasons.join(', ')})` : ''}
        </span>
      </div>
      {item.snapshot.title && <p className="post__title">{item.snapshot.title}</p>}
      <p className="voice">{item.snapshot.text || '—'}</p>
      {item.automod?.matches.length ? (
        <p className="meta">matched: {item.automod.matches.map((m) => `“${m.term}” (${m.category})`).join(', ')}</p>
      ) : null}
      {item.kind === 'dm' && item.delivered && <p className="meta">Delivered to the other person with crisis resources shown to both.</p>}
      <div className="row">
        <button type="button" className="act act--quiet act--wash" disabled={busy} onClick={run(() => approveContent({ queueId: item.id }))}>
          {item.delivered || item.reports ? 'Keep it up' : 'Approve'}
        </button>
        <input aria-label="Note to the writer (optional)" placeholder="note to the writer (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="admin-note" />
        <button type="button" className="act act--quiet" disabled={busy} onClick={run(() => removeContent({ queueId: item.id, note }))}>
          {item.kind === 'profile' ? 'Reset profile' : 'Remove'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  )
}

const Queue = () => {
  const queue = useQueryData<QueueItem>('admin-queue', () =>
    query(collection(db, 'modQueue'), where('state', '==', 'open'), orderBy('priority', 'desc'), orderBy('createdAt', 'asc'), limit(50)),
  )
  if (queue.error) return <p className="error">{describeError(queue.error)}</p>
  if (!queue.loading && queue.data.length === 0) return <p className="empty">Nothing waiting. The queue is clear.</p>
  return (
    <ul className="ruled-list">
      {queue.data.map((item) => (
        <QueueEntry key={item.id} item={item} />
      ))}
    </ul>
  )
}

const openDocument = async (uid: string, name: string) => {
  // getBlob goes through Storage rules; download URLs would not
  const blob = await getBlob(ref(storage, `proDocs/${uid}/${name}`))
  window.open(URL.createObjectURL(blob), '_blank', 'noopener')
}

const Application = ({ app, person }: { app: ProApplication & { id: string }; person?: Profile }) => {
  const { busy, error, run } = useAction()
  const [note, setNote] = useState('')
  return (
    <li className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {person ? <Who person={{ ...person, avatarSeed: person.avatarSeed || person.id }} /> : <span className="code">{app.uid}</span>}
        <span className="meta">submitted {ago(app.submittedAt)}</span>
      </div>
      <dl className="admin-dl">
        <dt>Legal name</dt>
        <dd>{app.legalName}</dd>
        <dt>Licence</dt>
        <dd>
          {app.licenseType} · {app.licenseRegion} · {app.licenseNumber}
        </dd>
        {app.statement && (
          <>
            <dt>Statement</dt>
            <dd>{app.statement}</dd>
          </>
        )}
      </dl>
      <div className="row">
        {app.files.map((f) => (
          <button key={f} type="button" className="link-btn" onClick={() => void openDocument(app.uid, f).catch(() => undefined)}>
            Open {f}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="act act--quiet act--wash" disabled={busy} onClick={run(() => reviewProfessional({ uid: app.uid, decision: 'approve', note }))}>
          Approve licence
        </button>
        <input aria-label="Note to the applicant (optional)" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="admin-note" />
        <button type="button" className="act act--quiet" disabled={busy} onClick={run(() => reviewProfessional({ uid: app.uid, decision: 'deny', note }))}>
          Deny
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </li>
  )
}

const Pros = () => {
  const apps = useQueryData<ProApplication & { id: string }>('admin-apps', () =>
    query(collection(db, 'proApplications'), where('status', '==', 'submitted'), orderBy('submittedAt', 'asc')),
  )
  const pros = useQueryData<Profile>('admin-pros', () => query(collection(db, 'users'), where('pro', '==', true)))
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))
  const { busy, run } = useAction()

  return (
    <div className="stack" style={{ gap: 32 }}>
      {apps.data.length === 0 ? (
        <p className="empty">No applications waiting.</p>
      ) : (
        <ul className="ruled-list">
          {apps.data.map((app) => (
            <Application key={app.id} app={app} person={byId.get(app.uid)} />
          ))}
        </ul>
      )}
      {pros.data.length > 0 && (
        <section className="stack">
          <span className="code">Licensed now</span>
          <ul className="ruled-list">
            {pros.data.map((p) => (
              <li key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
                <Who person={{ ...p, avatarSeed: p.avatarSeed || p.id }} />
                <button type="button" className="link-btn" disabled={busy} onClick={run(() => reviewProfessional({ uid: p.id, decision: 'revoke' }))}>
                  Revoke mark
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const PersonAdmin = ({ person, me }: { person: Profile; me: string }) => {
  const { busy, error, run } = useAction()
  const [reason, setReason] = useState('')
  const [hide, setHide] = useState(false)
  return (
    <li className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Who person={{ ...person, avatarSeed: person.avatarSeed || person.id }} />
        <span className="meta">{person.banned ? 'banned' : 'active'}</span>
      </div>
      {person.id !== me &&
        (person.banned ? (
          <div className="row">
            <button type="button" className="act act--quiet" disabled={busy} onClick={run(() => unbanUser({ uid: person.id }))}>
              Lift ban
            </button>
          </div>
        ) : (
          <div className="row">
            <input aria-label="Reason for the ban" placeholder="reason (required to ban)" value={reason} onChange={(e) => setReason(e.target.value)} className="admin-note" />
            <label className="code row" style={{ gap: 6 }}>
              <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> hide their writing
            </label>
            <button
              type="button"
              className="act act--quiet"
              disabled={busy || reason.trim().length < 3}
              onClick={run(() => banUser({ uid: person.id, reason: reason.trim(), hideContent: hide }))}
            >
              Ban
            </button>
            <button type="button" className="link-btn" disabled={busy} onClick={run(() => setAdmin({ uid: person.id, admin: true }))}>
              Make moderator
            </button>
          </div>
        ))}
      {error && <p className="error">{error}</p>}
    </li>
  )
}

const People = ({ me }: { me: string }) => {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const results = useQueryData<Profile>(term.length >= 2 ? `admin-people|${term}` : null, () =>
    query(collection(db, 'users'), where('penNameLower', '>=', term), where('penNameLower', '<=', `${term}`), limit(20)),
  )
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="people-search">Find by pen name</label>
        <input id="people-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="at least 2 letters" />
      </div>
      <ul className="ruled-list">
        {results.data.map((p) => (
          <PersonAdmin key={p.id} person={p} me={me} />
        ))}
      </ul>
    </div>
  )
}

export const Admin = () => {
  const { uid } = useMe()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'queue'

  return (
    <>
      <PageHead
        title="Review"
        kicker="Joseph Z’s Warm Gray — PY43 PBk6"
        lede="Crisis items come first. Approve what fits, remove what doesn’t, and leave a short note when it helps."
        seed={91}
      />
      <div className="tabs" role="tablist" aria-label="Review">
        {(
          [
            ['queue', 'Queue'],
            ['pros', 'Professionals'],
            ['people', 'People'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setParams(value === 'queue' ? {} : { tab: value })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'queue' && <Queue />}
      {tab === 'pros' && <Pros />}
      {tab === 'people' && <People me={uid} />}
    </>
  )
}
