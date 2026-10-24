import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { getBlob, ref } from 'firebase/storage'
import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { refusedAsModerator } from '../auth/moderator'
import { PageHead } from '../components/PageHead'
import { Who } from '../components/Who'
import { approveContent, banUser, describeError, problemOf, removeContent, reviewProfessional, setAdmin, unbanUser, type ModOutcome } from '../lib/callables'
import { db, storage } from '../lib/firebase'
import { focusForNow } from '../lib/focusForNow'
import { useQueryData } from '../lib/live'
import { openInNewTab } from '../lib/newTab'
import { penNameSearchTerm } from '../lib/penNameSearch'
import { readsReports, reportDetails } from '../lib/reportDetails'
import { outcomeNote } from '../lib/reviewOutcome'
import { banSaid, focusLost, licenceSaid, type Licence } from '../lib/reviewResult'
import { roleFocus, type RoleChange } from '../lib/roleQuestion'
import { ago } from '../lib/time'
import type { FiledReport, ProApplication, Profile, QueueItem } from '../lib/types'

type Tab = 'queue' | 'pros' | 'people'

const KIND: Record<QueueItem['kind'], string> = {
  post: 'Group post',
  comment: 'Comment',
  groupMessage: 'Group talk',
  dm: 'Private note',
  chatMessage: 'Private chat note',
  profile: 'Profile',
}

// Refusals that carry a reason (details.problem), said plainly: trying again won't help
const PROBLEMS: Record<string, string> = {
  admin: 'They’re a moderator. Remove their moderator role first.',
}

const useAction = () => {
  const { refreshClaims } = useMe()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<unknown>) => async () => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      const problem = problemOf(e)
      setError((problem && PROBLEMS[problem]) || describeError(e))
      // The role may have been removed elsewhere while the token here still says it
      if (refusedAsModerator(e)) refreshClaims().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

// Every report on the writing, read from the reports themselves and not copied to the queue item:
// deleting an account deletes its reports, so what they wrote goes with it
const reportsOn = (path: string) => query(collection(db, 'reports'), where('contentPath', '==', path))

const QueueEntry = ({ item, tell }: { item: QueueItem; tell: (outcome?: ModOutcome) => void }) => {
  const { uid } = useMe()
  const { busy, error, run } = useAction()
  const [note, setNote] = useState('')
  const decide = (action: () => Promise<{ outcome?: ModOutcome }>) => run(async () => tell((await action()).outcome))
  const reads = readsReports(item, uid)
  const filed = useQueryData<FiledReport>(reads ? `admin-reports|${item.contentPath}` : null, () => reportsOn(item.contentPath))
  const wrote = reportDetails(item, filed.data, uid)
  const crisis = item.automod?.crisis || item.reports?.reasons.includes('selfHarm')
  const where = item.groupId ? (
    <Link to={`/groups/${item.groupId}`}>{item.groupId}</Link>
  ) : item.kind === 'dm' ? (
    'private thread'
  ) : item.kind === 'chatMessage' ? (
    'private group chat'
  ) : (
    'profile'
  )

  return (
    <li className="stack admin-entry" style={{ gap: 10 }}>
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
      {wrote.length > 0 && (
        <>
          <p className="meta">reporters wrote:</p>
          <dl className="admin-dl">
            {wrote.map((report) => (
              <Fragment key={report.id}>
                <dt>{report.reason}</dt>
                <dd>{report.details}</dd>
              </Fragment>
            ))}
          </dl>
        </>
      )}
      {filed.error && (
        <p className="error" role="alert">
          Couldn’t read what reporters wrote. {describeError(filed.error)}
        </p>
      )}
      {item.reports && !reads && <p className="meta">This is about you, so what reporters wrote is left for another moderator.</p>}
      {item.kind === 'dm' && item.delivered && <p className="meta">Delivered to the other person with crisis resources shown to both.</p>}
      {item.kind === 'chatMessage' && item.delivered && <p className="meta">Delivered to the chat with crisis resources shown to everyone in it.</p>}
      <div className="row">
        <button type="button" className="act act--quiet act--wash" disabled={busy} onClick={decide(() => approveContent({ queueId: item.id }))}>
          {item.delivered || item.reports ? 'Keep it up' : 'Approve'}
        </button>
        <input aria-label="Note to the writer (optional)" placeholder="note to the writer (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="admin-note" />
        <button type="button" className="act act--quiet" disabled={busy} onClick={decide(() => removeContent({ queueId: item.id, note }))}>
          {item.kind === 'profile' ? 'Reset profile' : 'Remove'}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

const Queue = () => {
  const queue = useQueryData<QueueItem>('admin-queue', () =>
    query(collection(db, 'modQueue'), where('state', '==', 'open'), orderBy('priority', 'desc'), orderBy('createdAt', 'asc'), limit(50)),
  )
  // What came of the last decision, when it wasn't what its button says. Said here, naming the
  // entry: the entry itself leaves the queue whatever came of it
  const [said, setSaid] = useState('')
  const tell = (item: QueueItem) => (outcome?: ModOutcome) => {
    const note = outcomeNote(outcome, item.kind)
    setSaid(note ? `${KIND[item.kind]} · ${item.authorPenName || 'unknown'} — ${note}` : '')
  }
  if (queue.error) return <p className="error" role="alert">{describeError(queue.error)}</p>
  return (
    <div className="stack">
      {/* Mounted from the start, so screen readers announce the note when it lands */}
      <p className="meta live" role="status">
        {said}
      </p>
      {!queue.loading && queue.data.length === 0 ? (
        <p className="empty">Nothing waiting. The queue is clear.</p>
      ) : (
        <ul className="ruled-list">
          {queue.data.map((item) => (
            <QueueEntry key={item.id} item={item} tell={tell(item)} />
          ))}
        </ul>
      )}
    </div>
  )
}

// Licence documents: each opens in a new tab, or is offered as a link when the browser blocks that
const useDocuments = (uid: string) => {
  const { busy, error, run } = useAction()
  const [tried, setTried] = useState('')
  const [held, setHeld] = useState<string | null>(null)
  // Documents are write-once, so each is downloaded once; the copies go when the row does
  const copies = useRef(new Map<string, string>())
  useEffect(() => {
    const urls = copies.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const copyOf = async (name: string) => {
    const kept = copies.current.get(name)
    if (kept) return kept
    // getBlob goes through Storage rules; download URLs would not
    const url = URL.createObjectURL(await getBlob(ref(storage, `proDocs/${uid}/${name}`)))
    copies.current.set(name, url)
    return url
  }

  const open = (name: string) =>
    run(async () => {
      setTried(name)
      setHeld(null)
      // Reached without an await from the click, so the tab opens before the download starts
      const { opened, url } = await openInNewTab(() => window.open('', '_blank'), () => copyOf(name))
      if (!opened) setHeld(url)
    })

  return { busy, error, tried, held, open }
}

// Where a licence decision is said, above both lists: the row it was made in leaves its list
type Teller = { say: (words: string) => void; status: RefObject<HTMLElement | null> }

const useDecision = (uid: string, who: string, { say, status }: Teller) => {
  const { busy, error, run } = useAction()
  // A decision is under way or made here, so the row leaving is this moderator's doing
  const deciding = useRef(false)
  // Leaving, the row takes the focused button with it, so focus goes to where the result is said
  useEffect(
    () => () => {
      if (deciding.current && focusLost(document) && status.current) focusForNow(status.current)
    },
    [status],
  )
  const decide = (request: { decision: Licence; note?: string }) =>
    run(async () => {
      say('')
      deciding.current = true
      // An older backend leaves outcome out
      const done: { ok: true; outcome?: ModOutcome } = await reviewProfessional({ uid, ...request }).catch((e) => {
        deciding.current = false
        throw e
      })
      say(licenceSaid(who, request.decision, done.outcome))
    })
  return { busy, error, decide }
}

const Application = ({ app, person, teller }: { app: ProApplication & { id: string }; person?: Profile; teller: Teller }) => {
  const { busy, error, decide } = useDecision(app.uid, person?.penName ?? app.uid, teller)
  const docs = useDocuments(app.uid)
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
          <button key={f} type="button" className="link-btn" disabled={docs.busy} onClick={docs.open(f)}>
            Open {f}
          </button>
        ))}
      </div>
      {docs.held && (
        <p className="meta">
          Your browser blocked the new tab.{' '}
          <a href={docs.held} target="_blank" rel="noopener">
            Open {docs.tried}
          </a>
        </p>
      )}
      {docs.error && (
        <p className="error" role="alert">
          Couldn’t open {docs.tried}. {docs.error}
        </p>
      )}
      <div className="row">
        <button type="button" className="act act--quiet act--wash" disabled={busy} onClick={decide({ decision: 'approve', note })}>
          Approve licence
        </button>
        <input aria-label="Note to the applicant (optional)" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="admin-note" />
        <button type="button" className="act act--quiet" disabled={busy} onClick={decide({ decision: 'deny', note })}>
          Deny
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

const LicensedPro = ({ pro, teller }: { pro: Profile; teller: Teller }) => {
  const { busy, error, decide } = useDecision(pro.id, pro.penName, teller)
  return (
    <li className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Who person={{ ...pro, avatarSeed: pro.avatarSeed || pro.id }} />
        <button type="button" className="link-btn" disabled={busy} onClick={decide({ decision: 'revoke' })}>
          Revoke mark
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

const Pros = () => {
  const apps = useQueryData<ProApplication & { id: string }>('admin-apps', () =>
    query(collection(db, 'proApplications'), where('status', '==', 'submitted'), orderBy('submittedAt', 'asc')),
  )
  const pros = useQueryData<Profile>('admin-pros', () => query(collection(db, 'users'), where('pro', '==', true)))
  // Unread, names fall back to the uid
  const people = useQueryData<Profile>('people', () => collection(db, 'users'))
  const byId = new Map(people.data.map((p) => [p.id, p]))
  // What came of the last decision, naming who it was about
  const [said, setSaid] = useState('')
  const status = useRef<HTMLParagraphElement>(null)
  const teller: Teller = { say: setSaid, status }

  return (
    <div className="stack" style={{ gap: 32 }}>
      {/* Mounted from the start, so screen readers announce what a decision did when it lands */}
      <p ref={status} className="meta live" role="status">
        {said}
      </p>
      {/* A refused or unanswered listen has no rows either, and isn't nobody waiting */}
      {apps.error ? (
        <p className="error" role="alert">
          Couldn’t read the applications. {describeError(apps.error)}
        </p>
      ) : !apps.loading && apps.data.length === 0 ? (
        <p className="empty">No applications waiting.</p>
      ) : (
        <ul className="ruled-list">
          {apps.data.map((app) => (
            <Application key={app.id} app={app} person={byId.get(app.uid)} teller={teller} />
          ))}
        </ul>
      )}
      {(pros.error || pros.data.length > 0) && (
        <section className="stack">
          <span className="code">Licensed now</span>
          {pros.error ? (
            <p className="error" role="alert">
              Couldn’t read who’s licensed. {describeError(pros.error)}
            </p>
          ) : (
            <ul className="ruled-list">
              {pros.data.map((p) => (
                <LicensedPro key={p.id} pro={p} teller={teller} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// Profiles don't say who moderates (everyone can read them), so both changes are offered. Each
// asks first, then says what it did, or that nothing needed doing
const ROLE: Record<RoleChange, { ask: string; done: string; already: string }> = {
  make: {
    ask: 'Make them a moderator? They’ll see flagged writing, bans and licence applications.',
    done: 'Now a moderator. They can open Review at /admin.',
    already: 'Already a moderator.',
  },
  remove: {
    ask: 'Remove their moderator role? If they have it, they’re signed out everywhere.',
    done: 'No longer a moderator. A page they already have open can still read the queue for up to an hour.',
    already: 'They weren’t a moderator.',
  },
}

const PersonAdmin = ({ person, me }: { person: Profile; me: string }) => {
  const { busy, error, run } = useAction()
  const [reason, setReason] = useState('')
  const [hide, setHide] = useState(false)
  const [asking, setAsking] = useState<RoleChange | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const question = useRef<HTMLSpanElement>(null)
  const make = useRef<HTMLButtonElement>(null)
  const remove = useRef<HTMLButtonElement>(null)
  const standing = useRef<HTMLSpanElement>(null)
  // The change last asked about, so focus can go back to its button
  const asked = useRef<RoleChange | null>(null)
  // A ban (true) or its lifting (false) asked for here, until the row shows it
  const banning = useRef<boolean | null>(null)
  useEffect(() => {
    const to = roleFocus(asking, asked.current)
    asked.current = asking
    if (!to) return
    const target = { question, make, remove }[to]
    target.current?.focus()
  }, [asking])
  // Ban and Lift ban swap places once the row shows the change, taking focus with the one pressed.
  // It comes to the row's word for where they stand, read out new, never to the button beside it,
  // which would undo it at the next Enter
  useEffect(() => {
    if (banning.current !== Boolean(person.banned)) return
    banning.current = null
    if (focusLost(document) && standing.current) focusForNow(standing.current)
  }, [person.banned])
  const ask = (change: RoleChange) => () => {
    setAsking(change)
    setSaid(null)
  }
  const changeRole = (change: RoleChange) =>
    run(async () => {
      const { was } = await setAdmin({ uid: person.id, admin: change === 'make' })
      setAsking(null)
      setSaid(was === (change === 'make') ? ROLE[change].already : ROLE[change].done)
    })
  const setBan = (ban: boolean) =>
    run(async () => {
      setSaid(null)
      banning.current = ban
      await (ban ? banUser({ uid: person.id, reason: reason.trim(), hideContent: hide }) : unbanUser({ uid: person.id })).catch((e) => {
        banning.current = null
        throw e
      })
      setSaid(banSaid(ban, ban && hide))
    })
  return (
    <li className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Who person={{ ...person, avatarSeed: person.avatarSeed || person.id }} />
        <span ref={standing} className="meta">{person.banned ? 'banned' : 'active'}</span>
      </div>
      {person.id !== me &&
        (person.banned ? (
          <div className="row">
            <button type="button" className="act act--quiet" disabled={busy} onClick={setBan(false)}>
              Lift ban
            </button>
          </div>
        ) : (
          <>
            <div className="row">
              <input aria-label="Reason for the ban" placeholder="reason (required to ban)" value={reason} onChange={(e) => setReason(e.target.value)} className="admin-note" />
              <label className="code row" style={{ gap: 6 }}>
                <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> hide their writing
              </label>
              <button type="button" className="act act--quiet" disabled={busy || reason.trim().length < 3} onClick={setBan(true)}>
                Ban
              </button>
            </div>
            {/* Keyed, so Yes is a button of its own, never the one just pressed reused in place */}
            {asking ? (
              <div key="ask" className="row">
                <span ref={question} tabIndex={-1} className="pencil">
                  {ROLE[asking].ask}
                </span>
                <button type="button" className="act act--quiet" disabled={busy} onClick={changeRole(asking)}>
                  Yes
                </button>
                <button type="button" className="link-btn" disabled={busy} onClick={() => setAsking(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div key="idle" className="row">
                <button ref={make} type="button" className="link-btn" disabled={busy} onClick={ask('make')}>
                  Make moderator
                </button>
                <button ref={remove} type="button" className="link-btn" disabled={busy} onClick={ask('remove')}>
                  Remove moderator
                </button>
              </div>
            )}
          </>
        ))}
      {/* Mounted from the start, and outside what a ban swaps, so screen readers announce what a
          change did when it lands */}
      {person.id !== me && (
        <p className="meta live" role="status">
          {said}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

const People = ({ me }: { me: string }) => {
  const [search, setSearch] = useState('')
  const term = penNameSearchTerm(search)
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
