import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

// Each key is read by name: a bare `import.meta.env` would inline every VITE_ value into the bundle
export const USING_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true'

// No Cloud Functions (no Blaze billing): calls go through Firestore to our own
// machine (functions/src/local-backend.ts), and Storage uploads are paused
export const LOCAL_BACKEND = import.meta.env.VITE_LOCAL_BACKEND === 'true'

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
})

// Before any other service, so Firestore, Storage and Functions carry a token from their first request.
// Off on the emulators (they never check) and until a site key exists.
const siteKey = USING_EMULATORS ? undefined : import.meta.env.VITE_APPCHECK_SITE_KEY
export const APP_CHECK_ON = Boolean(siteKey)
if (siteKey) {
  // Dev server only: reCAPTCHA can't vouch for 127.0.0.1, so send a debug token registered in the
  // console (`true` prints a new one to register). Production builds drop this branch, token and all.
  if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })
}

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app, 'us-central1')
export const storage = getStorage(app)

// 127.0.0.1, not localhost: some resolvers pick IPv6 ::1, which the emulators don't bind
if (USING_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}
