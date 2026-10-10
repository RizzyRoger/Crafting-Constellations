# Crafting Constellations

A quiet support network for families living alongside an illness. People join groups ("constellations"), talk, post, write privately to people they've connected with, and get advice from licensed professionals. Everything is checked by an auto-moderator before others see it, and a moderator reviews what's flagged.

The visual world is **The Value Study** (watercolor, paper, pencil): see `.impeccable/handoff.md` and the sample boards in `samples/`.

## Run it locally

You need Node 20+ and Java 21+ (for the Firebase emulators).

```bash
npm install
```

```bash
npm --prefix functions install
```

In one terminal, start the Firebase emulators (Auth, Firestore, Functions, Storage):

```bash
npm run emulators
```

In a second terminal, load the synthetic sample data:

```bash
npm run seed
```

Then start the app and open http://127.0.0.1:5173:

```bash
npm run dev
```

To run the app against the real project instead (after setting it up below):

```bash
npm run dev:live
```

- **Sample accounts:** `synth01@example.test` … `synth16@example.test`, password in `scripts/seed.ts`. `synth01` is a moderator, `synth02` is a licensed professional. Everything seeded is marked "sample".
- **Email confirmation (emulator):** the link is printed in the emulator terminal and listed at http://127.0.0.1:4000/auth.
- **After reseeding,** reload the app: wiping the emulator under an open tab confuses the Firestore client.
- **Your own account:** `SEED_ME_UID=<your uid> npm run seed` joins it to two groups and gives it two incoming connection requests.

## Tests

```bash
npm test
```

```bash
npm run test:rules
```

```bash
npm run test:e2e
```

```bash
npm run test:local-backend
```

- `npm test` covers the moderation rules, the constellation layout, the account-deletion rules, and helpers.
- `npm run test:rules` runs the Firestore and Storage security rules against the emulators.
- `npm run test:e2e` runs account deletion end to end (function, triggers, Storage) against the emulators.
- `npm run test:local-backend` runs the local backend (below) against the emulators, with no Functions emulator.

Stop `npm run emulators` before the last three; they use the same ports.

## Connect a real Firebase project

The live site is **craftingconstellations.com** on Firebase Hosting.

- **Two plans:** Auth, Firestore, Hosting, Analytics and Performance work on the free **Spark** plan. Cloud Functions and (on new projects) Storage need **Blaze**, and the app needs functions to save a profile or publish anything.
- **Where the config lives:** `.env.local` (see `.env.example`). It is used by `npm run build` and `npm run dev:live`. Plain `npm run dev` always uses the emulators.

### 1. Console (Spark)

1. **Project settings → Integrations → Google Analytics → Enable**, with data sharing off. Do this first so the web config includes `measurementId`.
2. **Project settings → Your apps → Web app** (tick "Also set up Firebase Hosting"). Copy the config into `.env.local` and set `VITE_USE_EMULATORS=false`.
3. **Authentication:**
   - Enable **Email/Password** and **Google**, and turn on email enumeration protection.
   - Under Settings → Authorized domains, add `craftingconstellations.com`, `www.craftingconstellations.com` and `127.0.0.1` (for `dev:live`).
4. **Firestore:** location `nam5` (matches the functions region `us-central1`), production mode.
5. **Google Analytics admin** (analytics.google.com) → the web data stream:
   - **Enhanced measurement off.** It would send real page addresses.
   - **Google signals off**, and data retention set to 2 months.
6. **App Check (optional, off for this project).** The code is in place (reCAPTCHA v3) and stays off until `VITE_APPCHECK_SITE_KEY` is set. To turn it on:
   - https://www.google.com/recaptcha/admin → create a **Score based (v3)** key for `craftingconstellations.com`, `<project-id>.web.app` and `<project-id>.firebaseapp.com`.
   - Put the **site key** in `VITE_APPCHECK_SITE_KEY`. In Firebase → App Check → your web app → **reCAPTCHA**, paste the **secret key**.
   - App Check → ⋮ → **Manage debug tokens** → add one, and put it in `.env.live.local` as `VITE_APPCHECK_DEBUG_TOKEN`. It's a secret: never in `.env.local`, never committed.
   - Don't enforce until the metrics look good (step 5).
7. **Performance → Get started.**
8. Sign the CLI in:

   ```bash
   npx firebase login
   ```

   `.firebaserc` already maps the alias **`prod`** to `crafting-constellations-bf029`, and every deploy script passes `--project prod`. The default stays the offline demo project, so a bare `firebase deploy` can't hit production.

### 2. Deploy what Spark allows

```bash
npm run deploy:rules
```

Wait until the indexes show "Enabled" in the console.

```bash
npm run deploy:hosting
```

The hosting deploy first runs `npm run check:live`. It refuses emulator settings, the demo project, a project that doesn't match the deploy target, or a debug token in the build. Then it builds.

Until functions are deployed, signing in works but onboarding can't save a pen name. To keep the half-working site off the real domain until then, deploy to a preview channel instead:

```bash
npx firebase hosting:channel:deploy preview --expires 7d --project prod
```

### 3. Custom domain

1. Hosting → **Add custom domain** → `craftingconstellations.com`, then add `www.craftingconstellations.com` as a redirect to it.
2. At the registrar (Namecheap → Advanced DNS):
   - remove the parking-page records;
   - add the TXT and A records Firebase shows.
   - SSL follows within minutes to about a day.
3. **Optional, once SSL is live:**
   - set `VITE_FIREBASE_AUTH_DOMAIN=craftingconstellations.com`;
   - add `https://craftingconstellations.com/__/auth/handler` to the OAuth client's authorized redirect URIs in Google Cloud.

   Google's sign-in window then shows the site's name instead of `<project-id>.firebaseapp.com`.

### 4. After upgrading to Blaze

1. Set a budget alert (Billing → Budgets). Alerts warn; they don't cap spending.
2. **Storage → Get started**, location `US-CENTRAL1`, production mode.
3. Deploy the Storage rules, and answer yes when asked to let them read Firestore:

   ```bash
   npm run deploy:storage
   ```

4. Moderators open licence documents with `getBlob`, which needs CORS on the bucket (origins are in `storage.cors.json`). Run this with your own `gcloud auth login`, or in Cloud Shell:

   ```bash
   gcloud storage buckets update gs://crafting-constellations-bf029.firebasestorage.app --cors-file=storage.cors.json
   ```

5. Copy `functions/.env.example` to `functions/.env.<project-id>` (gitignored) and fill in `ADMIN_EMAILS`.
6. Deploy the functions. The first deploy switches on several Cloud APIs. If it fails on an Eventarc permission, wait about 5 minutes and run it again.

   ```bash
   npm run deploy:functions
   ```

7. Sign in with a listed email, confirm it, open **Review** and press "I'm on the moderator list".

### 5. App Check enforcement (only if App Check is on, a week or two later)

1. Check App Check → APIs: when about 98% or more of requests are verified, set `ENFORCE_APP_CHECK=true` in `functions/.env.<project-id>`.
2. Then deploy the functions:

   ```bash
   npm run deploy:functions
   ```

3. Enforce **Cloud Firestore**, then **Storage**, in the App Check console.

`deleteAccount` never requires App Check, so people whose browser blocks reCAPTCHA can still leave.

### Without Blaze: the local backend (Intel NUC)

While the project can't use Cloud Functions, a small program on our own machine does their work: `functions/src/local-backend.ts`.
- **How the site reaches it:** with `VITE_LOCAL_BACKEND=true`, the site writes each call (pen name, admin actions, account deletion) to `calls/{id}`. The backend runs the same callable code and writes the answer back. The rules check the caller and their sign-in time.
- **What else it does:** it watches Firestore for what the triggers did (moderating new writing, reports, friendships, counters).
- **No inbound ports:** it only makes outgoing connections, so no ports, tunnel or domain are needed.
- **Restarts:** after a restart, it catches up on anything that arrived while it was off.
- **Not available:** licence uploads need Storage, so they're paused (the Professional page says so).

**On the NUC** (Linux, Node 22):

1. Get the code and build the functions package:

   ```bash
   git clone https://github.com/RizzyRoger/Crafting-Constellations.git
   ```

   ```bash
   cd Crafting-Constellations && npm --prefix functions ci && npm --prefix functions run build
   ```

2. Get the key file: Firebase console → ⚙️ Project settings → **Service accounts** → **Generate new private key**. Save it on the NUC only, readable by you alone:
   - for example `~/crafting-constellations-key.json`, with `chmod 600`;
   - it grants full access to the project: never commit it, never paste it anywhere.
3. List the moderators in `functions/.env.crafting-constellations-bf029` (gitignored), for example `ADMIN_EMAILS=you@example.com`.
4. Try it. It prints `running for crafting-constellations-bf029` and one line per call:

   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=$HOME/crafting-constellations-key.json node functions/lib/local-backend.js
   ```

5. Keep it running across reboots with systemd: save this as `/etc/systemd/system/crafting-constellations.service`, with your user name and paths:

   ```ini
   [Unit]
   Description=Crafting Constellations local backend
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=YOUR_USER
   WorkingDirectory=/home/YOUR_USER/Crafting-Constellations
   Environment=GOOGLE_APPLICATION_CREDENTIALS=/home/YOUR_USER/crafting-constellations-key.json
   ExecStart=/usr/bin/node functions/lib/local-backend.js
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now crafting-constellations
   ```

   Logs: `journalctl -u crafting-constellations -f`. If a Firestore listener fails, the program exits on purpose so systemd restarts it.

**On the site:**
1. Set `VITE_LOCAL_BACKEND=true` in `.env.local`.
2. Deploy the rules and indexes; the backend needs the collection-group `status` indexes:

   ```bash
   npm run deploy:rules
   ```

3. Deploy the site:

   ```bash
   npm run deploy:hosting
   ```

**When Cloud Functions are available again:**
1. Deploy the functions (and Storage).
2. Set `VITE_LOCAL_BACKEND=false` and redeploy the site.
3. Stop the service:

   ```bash
   sudo systemctl disable --now crafting-constellations
   ```

Don't run both at once.

### Privacy

Counting visits (Analytics + Performance) is **opt-in per device and off by default**, and never runs on the emulators.
- **Analytics:** gets the route pattern (`/groups/:groupId`), never the real address, plus three fixed events: `sign_up`, `login`, `delete_account`.
- **Never sent:** user ids, ad signals or Google signals.
- **Performance:** sends real page addresses and load times. The consent note says so.

People can change their answer under **You → Account**.

### Account deletion

**You → Account → Delete my account…** asks for the pen name and a fresh sign-in, then `deleteAccount` removes:
- the profile, its settings and notices, and the pen name;
- memberships, connections and friendships;
- their posts, with everything under them;
- their comments, group messages and likes;
- private threads, both sides;
- reports they filed, and review-queue items that would point at nothing;
- their licence application and documents, and their posting-rate stamps;
- the sign-in itself.

Ban records and the audit log stay; the audit row holds ids and counts only. Moderators can't delete themselves; another moderator has to remove their role first.

## How it fits together

| Area | Where |
| --- | --- |
| Auto-moderator (word lists, crisis phrases, links, contact details) | `functions/src/moderation/` (shared with the client as a preview) |
| Publishing, holding, counters, reports, admin actions | `functions/src/` |
| Account deletion (`deleteAccount`), function options and App Check flag | `functions/src/account.ts`, `functions/src/options.ts` |
| Who can read and write what | `firestore.rules`, `storage.rules` |
| Firebase setup, App Check | `src/lib/firebase.ts` |
| Opt-in Analytics + Performance | `src/lib/telemetry.ts`, `src/components/ConsentNote.tsx` |
| Local backend (no Cloud Functions): calls through `calls/{id}`, triggers as listeners | `functions/src/local-backend.ts`, `src/lib/callables.ts` |
| Pages | `src/pages/` |
| Watercolor washes (canvas, in a worker) | `src/wash/` |
| Constellation chart | `src/constellation/` |
| Sample data | `scripts/seed.ts` |

**Writing goes in `pending`.** A Cloud Function then decides:
- **Clean:** published.
- **Flagged:** held for a moderator.
- **Crisis language in a group:** held, and the writer sees crisis resources.
- **Crisis language in a private note:** delivered, with resources shown to both people, and queued for a moderator first.

Emails never go into Firestore; people only ever see pen names. Crisis resources are in `src/components/CrisisCard.tsx`. Review them for your region before launch.
