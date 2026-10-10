import { setGlobalOptions } from 'firebase-functions/v2'
import type { CallableOptions } from 'firebase-functions/v2/https'

// Imported first by index.ts: onCall / onDocument* copy the global options
// when they are defined, so setting them after the exports does nothing.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 })

// 'true' in functions/.env.<project-id> once App Check metrics look healthy
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true'

export const callable = (extra: CallableOptions = {}): CallableOptions => ({ enforceAppCheck: ENFORCE_APP_CHECK, ...extra })
