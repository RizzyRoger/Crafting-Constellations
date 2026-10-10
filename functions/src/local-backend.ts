/*
 * Local backend: does Cloud Functions' work from our own machine (the Intel NUC)
 * while the project can't run Cloud Functions. It only makes outgoing connections.
 * - Answers the calls the site writes to calls/{id} (site built with VITE_LOCAL_BACKEND=true)
 *   by running each callable's own handler.
 * - Watches Firestore for what the triggers would do: moderate pending writing
 *   (which also pings people), handle reports, mirror friendships and tell people
 *   their request was accepted, keep counters.
 * Everything here is safe to repeat, so a restart simply catches up.
 *
 *   npm --prefix functions run build
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node functions/lib/local-backend.js
 *
 * Moderator emails come from functions/.env.<project-id> (or ADMIN_EMAILS in the environment).
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DocumentData, DocumentReference, Query, QuerySnapshot } from 'firebase-admin/firestore'
import type { CallableFunction, CallableRequest } from 'firebase-functions/v2/https'

// Must match the allow-list in firestore.rules (calls/{callId})
const CALLABLES = [
  'saveProfile',
  'deleteAccount',
  'approveContent',
  'removeContent',
  'banUser',
  'unbanUser',
  'reviewProfessional',
  'setAdmin',
  'bootstrapAdmin',
  'createGroup',
  'createChat',
] as const

// The site gives up after 25s; anything older is not run, so a backlog never
// performs something (like deleting an account) long after the person left
const CALL_TTL_MS = 30_000
const CALL_CLEANUP_EVERY_MS = 10 * 60_000

const log = (...parts: unknown[]) => console.log(new Date().toISOString(), '[local-backend]', ...parts)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Project, moderator list and (no) Storage bucket, before firebase-admin initialises
const prepareEnv = () => {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const projectId = process.env.GCLOUD_PROJECT ?? (keyFile ? (JSON.parse(readFileSync(keyFile, 'utf8')).project_id as string) : undefined)
  if (!projectId) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the service-account key file.')
  process.env.GCLOUD_PROJECT = projectId
  // No storageBucket: Storage isn't available without Blaze, so account deletion skips it
  process.env.FIREBASE_CONFIG ??= JSON.stringify({ projectId })
  const params = fileURLToPath(new URL(`../.env.${process.env.FIRESTORE_EMULATOR_HOST ? 'local' : projectId}`, import.meta.url))
  if (existsSync(params)) process.loadEnvFile(params)
  // The Firebase CLI hands list params to functions as JSON; .env files hold them comma-separated
  const admins = process.env.ADMIN_EMAILS
  if (admins !== undefined && !admins.trim().startsWith('[')) {
    process.env.ADMIN_EMAILS = JSON.stringify(admins.split(',').map((email) => email.trim()).filter(Boolean))
  }
  return projectId
}

// Transient failures (network, contention) get a few more tries; the work is idempotent
const retrying = async (what: string, work: () => Promise<unknown>, attempt = 1): Promise<void> => {
  try {
    await work()
  } catch (error) {
    if (attempt >= 5) {
      log(`gave up on ${what}:`, error)
      return
    }
    await sleep(attempt * 5000)
    await retrying(what, work, attempt + 1)
  }
}

// Collect paths for a second, then handle each once (counters after a burst of likes)
const batched = (flush: (paths: string[]) => Promise<void>) => {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined
  return (path: string) => {
    pending.add(path)
    timer ??= setTimeout(() => {
      const paths = [...pending]
      pending.clear()
      timer = undefined
      void flush(paths)
    }, 1000)
  }
}

// Firestore can't store undefined; callables may return it
const plain = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as unknown

export const startLocalBackend = async () => {
  const projectId = prepareEnv()
  const { FieldValue } = await import('firebase-admin/firestore')
  const { HttpsError } = await import('firebase-functions/v2/https')
  const { auth, db, NOT_FOUND } = await import('./app.js')
  const functions = (await import('./index.js')) as unknown as Record<(typeof CALLABLES)[number], CallableFunction<unknown, unknown>>
  const { handleNewContent } = await import('./content.js')
  const { handleReport } = await import('./reports.js')
  const { mirrorFriendshipOf, noticeOnAccept } = await import('./friendships.js')
  const { acceptedWhileAway } = await import('./notifyPolicy.js')

  const ignoreMissing = (error: { code?: number }) => {
    if (error.code !== NOT_FOUND) throw error
  }

  // A listener that dies leaves work undone without anyone noticing: exit, and let the service manager restart us
  const watch = (name: string, query: Query, onChange: (snap: QuerySnapshot) => void) =>
    query.onSnapshot(onChange, (error) => {
      log(`listener "${name}" failed, exiting so the service restarts:`, error)
      process.exit(1)
    })

  // ---------- calls ----------

  const errorOf = (error: unknown) => {
    if (error instanceof HttpsError) {
      return { status: error.code, message: error.message, ...(error.details === undefined ? {} : { details: plain(error.details) }) }
    }
    log('call failed:', error)
    return { status: 'internal', message: 'internal' }
  }

  // The same request a callable gets from a verified ID token: claims, email and
  // verification read live from Auth, and the sign-in time the rules checked
  const run = async (call: DocumentData) => {
    const fn = (CALLABLES as readonly string[]).includes(call.name) ? functions[call.name as (typeof CALLABLES)[number]] : undefined
    if (!fn) throw new HttpsError('not-found', 'call')
    const user = await auth.getUser(call.uid).catch(() => null)
    if (!user || user.disabled) throw new HttpsError('unauthenticated', 'Sign in first.')
    const token = { ...user.customClaims, uid: user.uid, sub: user.uid, email: user.email, email_verified: user.emailVerified, auth_time: call.authTime }
    return fn.run({ data: call.data, auth: { uid: user.uid, token, rawToken: '' }, acceptsStreaming: false } as unknown as CallableRequest<unknown>)
  }

  const answer = async (ref: DocumentReference) => {
    // Claim it first, so a replayed snapshot or a second backend never runs it twice
    const call = await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data()
      if (!data || data.state !== 'new') return null
      const age = Date.now() - (data.createdAt?.toMillis?.() ?? 0)
      tx.update(ref, age > CALL_TTL_MS ? { state: 'expired' } : { state: 'running' })
      return age > CALL_TTL_MS ? null : data
    })
    if (!call) return
    const started = Date.now()
    const reply = await run(call).then(
      (result) => ({ state: 'done', result: plain(result) }),
      (error: unknown) => ({ state: 'failed', error: errorOf(error) }),
    )
    // The site may already have given up and removed the call
    await ref.update({ ...reply, answeredAt: FieldValue.serverTimestamp() }).catch(ignoreMissing)
    log(`${call.name} ${reply.state} in ${Date.now() - started}ms`)
  }

  const removeStaleCalls = async () => {
    const stale = await db.collection('calls').where('createdAt', '<', new Date(Date.now() - CALL_CLEANUP_EVERY_MS)).get()
    await Promise.all(stale.docs.map((d) => d.ref.delete()))
  }

  // ---------- counters (recounted, never incremented: restarts can't drift them) ----------

  const recountGroups = batched(async (paths) => {
    await Promise.all(
      paths.map((path) =>
        retrying(`count ${path}`, async () => {
          const group = db.doc(path)
          const members = await group.collection('members').count().get()
          await group.update({ memberCount: members.data().count }).catch(ignoreMissing)
        }),
      ),
    )
  })

  const recountPosts = batched(async (paths) => {
    await Promise.all(
      paths.map((path) =>
        retrying(`count ${path}`, async () => {
          const post = db.doc(path)
          const [likes, comments] = await Promise.all([
            post.collection('likes').count().get(),
            post.collection('comments').where('status', '==', 'published').count().get(),
          ])
          await post.update({ likeCount: likes.data().count, commentCount: comments.data().count }).catch(ignoreMissing)
        }),
      ),
    )
  })

  // The first snapshot is the baseline: recount everything once, then follow changes
  const parentsOnChange = (recount: (path: string) => void, everything: () => Promise<string[]>) => {
    let primed = false
    return (snap: QuerySnapshot) => {
      if (!primed) {
        primed = true
        void everything().then((paths) => paths.forEach(recount))
        return
      }
      snap.docChanges().forEach((change) => {
        const parent = change.doc.ref.parent.parent
        if (parent) recount(parent.path)
      })
    }
  }

  const allGroups = async () => (await db.collection('groups').get()).docs.map((d) => d.ref.path)
  const allPosts = async () => (await db.collectionGroup('posts').get()).docs.map((d) => d.ref.path)

  // ---------- friendships ----------

  // Snapshots carry no "before", so remember each status to see pending → accepted.
  // The first snapshot fills this in, and announces acceptances from while we were off
  // (recent ones only; the notice id names the acceptance, so none is announced twice).
  const statuses = new Map<string, string>()
  let connectionsPrimed = false
  const onConnections = (snap: QuerySnapshot) => {
    snap.docChanges().forEach((change) => {
      const id = change.doc.id
      const after = change.type === 'removed' ? undefined : change.doc.data()
      const before = statuses.get(id)
      if (after) statuses.set(id, after.status)
      else statuses.delete(id)
      void retrying(`friendship ${id}`, () => mirrorFriendshipOf(id, after))
      if (connectionsPrimed) void retrying(`accepted ${id}`, () => noticeOnAccept(id, before, after))
      else if (after && acceptedWhileAway(after.status, after.updatedAt?.toMillis?.(), Date.now())) {
        void retrying(`accepted while away ${id}`, () => noticeOnAccept(id, 'pending', after))
      }
    })
    if (connectionsPrimed) return
    connectionsPrimed = true
    // Connections removed while we were off left their friendship behind
    const accepted = new Set(snap.docs.filter((d) => d.data().status === 'accepted').map((d) => d.id))
    void db
      .collection('friendships')
      .get()
      .then((friendships) => Promise.all(friendships.docs.filter((d) => !accepted.has(d.id)).map((d) => d.ref.delete())))
  }

  const added = (handle: (ref: DocumentReference, data: DocumentData) => Promise<unknown>, what: string) => (snap: QuerySnapshot) =>
    snap
      .docChanges()
      .filter((change) => change.type === 'added')
      .forEach((change) => void retrying(`${what} ${change.doc.ref.path}`, () => handle(change.doc.ref, change.doc.data())))

  const stops = [
    watch('calls', db.collection('calls').where('state', '==', 'new'), (snap) =>
      snap
        .docChanges()
        .filter((change) => change.type === 'added')
        .forEach((change) => void answer(change.doc.ref).catch((error: unknown) => log('answering failed:', error))),
    ),
    ...['posts', 'comments', 'messages'].map((group) =>
      watch(`pending ${group}`, db.collectionGroup(group).where('status', '==', 'pending'), added((ref) => handleNewContent(ref), 'moderate')),
    ),
    watch('reports', db.collection('reports'), added((_, data) => handleReport(data), 'report')),
    watch('connections', db.collection('connections'), onConnections),
    watch('members', db.collectionGroup('members'), parentsOnChange(recountGroups, allGroups)),
    watch('likes', db.collectionGroup('likes'), parentsOnChange(recountPosts, allPosts)),
    watch('comments', db.collectionGroup('comments'), parentsOnChange(recountPosts, allPosts)),
  ]

  const cleanup = setInterval(() => void removeStaleCalls().catch((error: unknown) => log('cleanup failed:', error)), CALL_CLEANUP_EVERY_MS)
  void removeStaleCalls()
  log(`running for ${projectId}`)

  return {
    stop: () => {
      clearInterval(cleanup)
      stops.forEach((stop) => stop())
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backend = await startLocalBackend()
  const shutdown = () => {
    log('stopping')
    backend.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
