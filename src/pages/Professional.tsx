import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { PageHead } from '../components/PageHead'
import { Quiet } from '../components/Quiet'
import { describeError } from '../lib/callables'
import { db, LOCAL_BACKEND, storage } from '../lib/firebase'
import { useDocData } from '../lib/live'
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

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'
const MAX_BYTES = 10 * 1024 * 1024
const SLOTS = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']

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

  if (application.loading) return <Quiet>Opening…</Quiet>

  const existing = application.data
  // Uploads are write-once; a resubmission uses the slots still free
  const freeSlots = SLOTS.filter((s) => !existing?.files.includes(s))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (files.length === 0) return setError('Add at least one document.')
    if (files.length > freeSlots.length) return setError(`You can add ${freeSlots.length} more document(s).`)
    const tooBig = files.find((f) => f.size > MAX_BYTES)
    if (tooBig) return setError(`${tooBig.name} is over 10 MB.`)

    setBusy(true)
    try {
      const names = freeSlots.slice(0, files.length)
      await Promise.all(files.map((file, i) => uploadBytes(ref(storage, `proDocs/${uid}/${names[i]}`), file, { contentType: file.type })))
      await setDoc(doc(db, `proApplications/${uid}`), {
        uid,
        status: 'submitted',
        legalName: legalName.trim(),
        licenseType,
        licenseRegion: licenseRegion.trim(),
        licenseNumber: licenseNumber.trim(),
        files: [...(existing?.files ?? []), ...names],
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
        <div className="banner">
          <p className="pencil note">Thank you. Your application is with a moderator. You’ll find a note under “You” when it’s been reviewed.</p>
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
        <p className="pencil note">
          <Link to="/verify">Confirm your email</Link> first, then come back to apply.
        </p>
      </>
    )
  }

  return (
    <>
      {head}
      {existing?.status === 'denied' && (
        <div className="banner" style={{ marginBottom: 24 }}>
          <p className="pencil note">Your last application wasn’t approved.{existing.reviewNote ? ` Note: ${existing.reviewNote}` : ''} You can apply again.</p>
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
          <label htmlFor="docs">Licence documents — PDF or image, up to {freeSlots.length}, 10 MB each</label>
          <input id="docs" type="file" accept={ACCEPT} multiple onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, freeSlots.length))} />
          {files.length > 0 && <span className="hint">{files.map((f) => f.name).join(', ')}</span>}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="act act--wash" disabled={busy || freeSlots.length === 0}>
            {busy ? 'Sending…' : 'Send for review'}
          </button>
        </div>
      </form>
    </>
  )
}
