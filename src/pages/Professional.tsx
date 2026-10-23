import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getMetadata, ref, uploadBytes } from 'firebase/storage'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Quiet } from '../components/Quiet'
import { describeError } from '../lib/callables'
import { db, LOCAL_BACKEND, storage } from '../lib/firebase'
import { useDocData } from '../lib/live'
import {
  applicationProblem,
  DOC_TYPES,
  documentRoom,
  documentsHint,
  openSlots,
  placeDocuments,
  reapplyNote,
  reapplyRound,
  slotsToCheck,
  SLOTS,
} from '../lib/proApplication'
import { hereOf } from '../lib/returnTo'
import type { ProApplication } from '../lib/types'

const LICENSE_TYPES = [
  ['psychologist', 'Psychologist'],
  ['psychiatrist', 'Psychiatrist'],
  ['counselor', 'Counselor'],
  ['socialWorker', 'Clinical social worker'],
  ['marriageFamilyTherapist', 'Marriage & family therapist'],
  ['psychiatricNurse', 'Psychiatric nurse'],
  ['other', 'Other licensed role'],
] as const

const ACCEPT = DOC_TYPES.join(',')

// Slots an earlier attempt filled without reaching the application; the owner may read their own
const storedSlots = async (uid: string, slots: string[]) => {
  const found = await Promise.all(
    slots.map((s) =>
      getMetadata(ref(storage, `proDocs/${uid}/${s}`)).then(
        () => true,
        (e: unknown) => {
          if ((e as { code?: string }).code === 'storage/object-not-found') return false
          throw e
        },
      ),
    ),
  )
  return slots.filter((_, i) => found[i])
}

// Remembers this page, so confirming comes back to it (see Verify), as ConfirmEmail does
const ConfirmFirst = () => {
  const location = useLocation()
  return (
    <p className="pencil note">
      <Link to="/verify" state={{ from: hereOf(location) }}>Confirm your email</Link> first, then come back to apply.
    </p>
  )
}

export const Professional = () => {
  const { uid, claims, profile } = useMe()
  const application = useDocData<ProApplication>(`proApplications/${uid}`)
  const [legalName, setLegalName] = useState('')
  const [licenseType, setLicenseType] = useState<string>('counselor')
  const [licenseRegion, setLicenseRegion] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [statement, setStatement] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const sent = useRef(false)

  if (application.loading) return <Quiet>Opening…</Quiet>

  const existing = application.data
  const listed = existing?.files ?? []
  const round = reapplyRound(existing)
  const room = documentRoom(existing)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setTries((n) => n + 1)
    setBusy(true)
    try {
      // Once there's an application, uploads are write-once, and a try that never reached it may have filled some
      const free = openSlots(listed, await storedSlots(uid, slotsToCheck(existing, files.length)))
      // Everything the rules check, before a refusal can strand an upload
      const problem = applicationProblem({ legalName, licenseRegion, licenseNumber, files, listed, open: round ? SLOTS.length : free.length })
      if (problem) return setError(problem)
      const placed = placeDocuments({ listed, free, count: files.length, round })
      await Promise.all(files.map((file, i) => uploadBytes(ref(storage, `proDocs/${uid}/${placed.names[i]}`), file, { contentType: file.type })))
      sent.current = true
      await setDoc(doc(db, `proApplications/${uid}`), {
        uid,
        status: 'submitted',
        legalName: legalName.trim(),
        licenseType,
        licenseRegion: licenseRegion.trim(),
        licenseNumber: licenseNumber.trim(),
        files: placed.files,
        ...(statement.trim() ? { statement: statement.trim() } : {}),
        submittedAt: serverTimestamp(),
      })
      setFiles([])
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  // Sending swaps the form, focused button and all, for the banner; focus follows so the thanks is heard
  const thanked = (banner: HTMLDivElement | null) => {
    if (!banner || !sent.current) return
    sent.current = false
    banner.focus()
  }

  const head = (
    <PageHead
      title="Licensed professionals"
      kicker="Alvaro’s Caliente Gray — PB7 PB29 PBk6"
      lede="Therapists, counselors and other licensed people can offer advice here. A moderator checks the licence; then a circled “licensed” mark appears next to the pen name."
      seed={57}
    />
  )

  if (profile.pro || claims.pro) {
    return (
      <>
        {head}
        <p className="pencil note">
          Your licence is checked. The <span className="licensed circled">licensed</span> mark shows next to your pen name on everything you write from now on.
        </p>
      </>
    )
  }

  if (existing?.status === 'submitted') {
    return (
      <>
        {head}
        <div className="banner" tabIndex={-1} ref={thanked}>
          <p className="pencil note">
            Thank you. Your application is with a moderator. You’ll find a note in <Link to="/notifications">Notifications</Link> when it’s been reviewed.
          </p>
        </div>
      </>
    )
  }

  // Licence documents need Storage, which the project can't use until billing is on
  if (LOCAL_BACKEND) {
    return (
      <>
        {head}
        <p className="pencil note">Applications are paused for a little while: we can’t take licence documents just yet. Please check back soon.</p>
      </>
    )
  }

  if (!claims.emailVerified) {
    return (
      <>
        {head}
        <ConfirmFirst />
      </>
    )
  }

  const again = reapplyNote(existing)
  const hint = documentsHint(listed.length, files.map((f) => f.name))

  return (
    <>
      {head}
      {again && (
        <div className="banner" style={{ marginBottom: 24 }}>
          <p className="pencil note">{again}</p>
        </div>
      )}
      <form className="form" onSubmit={submit} style={{ maxWidth: 560 }}>
        <p className="meta">Only moderators see this form and your documents. Your legal name is never shown — people only see your pen name and the mark.</p>
        <div className="field">
          <label htmlFor="legal">Legal name (as on your licence)</label>
          <input id="legal" required minLength={2} maxLength={120} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="type">Licence type</label>
          <select id="type" value={licenseType} onChange={(e) => setLicenseType(e.target.value)}>
            {LICENSE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="region">Where you’re licensed (state, country)</label>
          <input id="region" required minLength={2} maxLength={80} value={licenseRegion} onChange={(e) => setLicenseRegion(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="number">Licence number</label>
          <input id="number" required minLength={2} maxLength={60} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="statement">Anything the moderator should know (optional)</label>
          <textarea id="statement" rows={3} maxLength={1000} value={statement} onChange={(e) => setStatement(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="docs">
            {listed.length ? 'New licence documents (optional)' : 'Licence documents'} — PDF or image, up to {room}, 10 MB each
          </label>
          <input
            id="docs"
            type="file"
            accept={ACCEPT}
            multiple
            disabled={room === 0}
            onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, room))}
          />
          {hint && <span className="hint">{hint}</span>}
        </div>
        {/* A new node each try, so the same refusal twice is announced twice */}
        {error && (
          <p key={tries} className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="act act--wash" disabled={busy}>
            {busy ? 'Sending…' : 'Send for review'}
          </button>
        </div>
      </form>
    </>
  )
}
