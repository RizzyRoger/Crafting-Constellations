/*
 * Runs before every hosting deploy (firebase.json predeploy). Refuses to ship a
 * build that would talk to the emulators, the demo project, or a different
 * project than the one being deployed to, or one that carries the App Check
 * debug token.
 *
 *   npm run check:live
 */
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), 'VITE_')
// Set by the Firebase CLI for predeploy hooks
const target = process.env.GCLOUD_PROJECT

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

const projectId = env.VITE_FIREBASE_PROJECT_ID ?? ''

const problems = [
  ...(env.VITE_USE_EMULATORS === 'true' ? ['VITE_USE_EMULATORS is true, so the site would talk to the local emulators.'] : []),
  ...REQUIRED.filter((key) => !env[key]).map((key) => `${key} is empty. Fill it in .env.local (see .env.example).`),
  ...(projectId.startsWith('demo-') ? [`VITE_FIREBASE_PROJECT_ID is the offline demo project (${projectId}).`] : []),
  ...(target && projectId && target !== projectId ? [`.env.local is for "${projectId}", but this deploy targets "${target}".`] : []),
  ...(env.VITE_APPCHECK_DEBUG_TOKEN ? ['VITE_APPCHECK_DEBUG_TOKEN is set for builds. Move it to .env.live.local.'] : []),
]

const warnings = [
  ...(env.VITE_APPCHECK_SITE_KEY ? [] : ['No VITE_APPCHECK_SITE_KEY: App Check is off for this build.']),
  ...(env.VITE_FIREBASE_MEASUREMENT_ID ? [] : ['No VITE_FIREBASE_MEASUREMENT_ID: Analytics and Performance are off for this build.']),
]

warnings.forEach((w) => console.warn(`warning: ${w}`))

if (problems.length > 0) {
  problems.forEach((p) => console.error(`error: ${p}`))
  process.exit(1)
}

console.log(`Live config looks right for ${projectId}.`)
