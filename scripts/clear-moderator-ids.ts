/*
 * One-off: takes moderators' uids off what the people they acted on can read. Writing a moderator
 * took down said who in removedBy, and a licence decision said who in reviewedBy; now removedBy
 * says only 'moderator' and reviewedBy is gone. Who decided is still in modQueue, bans and
 * adminActions. Emulator by default; --dry-run counts and changes nothing.
 *   npx tsx scripts/clear-moderator-ids.ts --dry-run
 * For a real project: set GOOGLE_APPLICATION_CREDENTIALS, then add --prod --project <id>.
 */
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const prod = args.includes('--prod')
const dryRun = args.includes('--dry-run')
const projectId = flag('project') ?? 'demo-crafting-constellations'

if (!prod) process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
if (prod && projectId.startsWith('demo-')) throw new Error('Pass --project <real-project-id> with --prod.')

initializeApp({ projectId })
const db = getFirestore()

// What removedBy says now; anything else in it is a moderator's uid
const LABELS = ['automod', 'moderator']
const NOT_FOUND = 5

const main = async () => {
  // Only removed writing has removedBy, and nothing brings removed writing back
  const removed = await Promise.all(['posts', 'comments', 'messages'].map((group) => db.collectionGroup(group).where('status', '==', 'removed').get()))
  const writing = removed.flatMap((s) => s.docs).filter((d) => d.get('removedBy') !== undefined && !LABELS.includes(d.get('removedBy')))
  const applications = (await db.collection('proApplications').get()).docs.filter((d) => d.get('reviewedBy') !== undefined)
  console.log(`${projectId}: ${writing.length} removed writing and ${applications.length} licence applications name a moderator.`)
  if (dryRun) return

  const writer = db.bulkWriter()
  const results = [
    ...writing.map((d) => writer.update(d.ref, { removedBy: 'moderator' })),
    ...applications.map((d) => writer.update(d.ref, { reviewedBy: FieldValue.delete() })),
  ].map((result) =>
    // Deleted meanwhile, with an account leaving: nothing left to clear
    result.catch((error: { code?: number }) => {
      if (error.code !== NOT_FOUND) throw error
    }),
  )
  await writer.close()
  await Promise.all(results)
  console.log('Cleared.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
