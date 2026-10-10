/*
 * Grants (or removes) the admin claim. Emulator by default.
 *   npm run grant-admin -- --email you@example.test
 *   npm run grant-admin -- --uid abc123 --remove
 * For a real project: set GOOGLE_APPLICATION_CREDENTIALS, then add --prod --project <id>.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const prod = args.includes('--prod')
const projectId = flag('project') ?? 'demo-crafting-constellations'

if (!prod) process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
if (prod && projectId.startsWith('demo-')) throw new Error('Pass --project <real-project-id> with --prod.')

initializeApp({ projectId })
const auth = getAuth()

const main = async () => {
  const email = flag('email')
  const uid = flag('uid')
  const user = email ? await auth.getUserByEmail(email) : uid ? await auth.getUser(uid) : undefined
  if (!user) throw new Error('Pass --email or --uid.')
  const admin = !args.includes('--remove')
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin })
  console.log(`${admin ? 'Granted' : 'Removed'} admin for ${user.uid}. They need to sign out and in (or refresh) to see it.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
