# Crafting Constellations — web app (Firebase)

## Go live: real project, craftingconstellations.com, App Check, Analytics/Perf, account deletion

Plan: `/Users/darren/.claude/plans/can-you-add-full-eager-metcalfe.md`

- [x] 1. Functions foundation: `options.ts` (global options that actually apply), `callable()` with the App Check flag
- [x] 2. Account deletion (server): `accountPolicy` + tests, `account.ts` purge, `likes.uid` index, hardening
- [x] 3. App Check in the client, typed env
- [x] 4. Analytics + Performance, opt-in, route patterns only
- [x] 5. Account deletion (client): `/delete-account`, links from Me and Onboarding
- [x] 6. Go-live config (prod alias + web.app CORS origin wait for the project id): env files, CORS, hosting cache headers, deploy scripts, env check; remove `CNAME`
- [x] 7. Docs: README, lessons
- [x] 8. Verify: typecheck, unit, rules, e2e (deleteAccount), build, emulator browser pass
- [ ] 9. With the user: console setup, keys, deploy (Spark now; Blaze later)
  - [x] Project `crafting-constellations-bf029`; web config in `.env.local`; `prod` alias; moderator list
  - [x] Firestore `(default)` in nam5; rules + indexes deployed
  - [x] Hosting live at https://crafting-constellations-bf029.web.app. Checked: headers, deep links, no Analytics before consent, route patterns only after.
  - [x] App Check dropped (user's call): site key cleared; code stays, gated off
  - [ ] User: custom domain craftingconstellations.com (Hosting → Add custom domain; Namecheap DNS)
  - [ ] User: upgrade to Blaze, set a budget alert, then Storage → Get started (US-CENTRAL1)
  - [ ] Then: `npm run deploy:storage`, CORS (`gcloud storage buckets update …`), `npm run deploy:functions`, claim admin
  - [ ] Roger: turn off GitHub Pages
  - [ ] Billing blocked: Google closed all three billing accounts ("not in good standing"). User asked support / a teammate.

## Local backend on the NUC (while Cloud Functions are unavailable)

User's choices: a request queue in Firestore (no inbound ports or tunnel); runs on the Intel NUC.

- [x] Rules: `calls/{id}`. The owner creates `{uid, name, data, authTime, state:'new', createdAt}`, with `authTime` == token `auth_time` and `name` on an allow-list; the owner may get and delete. Rules tests.
- [x] Indexes: collection-group `status` on posts / comments / messages (the worker's pending listeners)
- [x] Functions: export the report and friendship handlers; purge skips Storage when no bucket is configured
- [x] `functions/src/local-backend.ts`:
  - answer `calls` by running each callable's own `run()`, with the token rebuilt from Auth (claims, email, verified) plus the rules-checked `authTime`;
  - listeners for pending content, reports, connections→friendships, and counters (recount with `update`, so restarts are safe);
  - clean up stale calls.
- [x] Client: `VITE_LOCAL_BACKEND=true` → `callables.ts` writes a call and waits for the answer, with a timeout. Professional uploads are paused with a note.
- [x] e2e on the emulators (auth + firestore, no functions emulator): pen name via the queue; error details come through; pending post → published; counters
- [x] README: NUC setup (Node 22, key file, env, systemd)
- [x] Deploy: rules + indexes + hosting with the flag
- [x] User: copy `crafting-constellations-backend.tgz` to the NUC, add the service-account key, start the backend (user reports it running)
- [x] Live database was empty: created the starter set (3 constellations, 8 groups, the seed's names without sample people) in one atomic commit with `exists:false` preconditions, using the CLI owner login
- [ ] User: sign up on the live site and choose a pen name. Then check `calls`, `users` and `penNames` from here.
- [ ] Follow-up: there is no admin screen for creating constellations or groups (the `createGroup` callable exists but has no UI)
- Verified:
  - rules tests 34 (3 new for `calls`);
  - local-backend e2e 6 (pen name, error details, admin refusal + bootstrapAdmin, deleteAccount with the rules-checked sign-in time, expired calls never run, moderation + counters);
  - deleteAccount e2e 5, unit tests 76;
  - browser in local-backend mode: a taken pen name shows the right error, then a free one saves (backend ~30ms per call); Professional shows the paused note;
  - the bundle builds from a clean extract.
- Found: the CLI turns list params into JSON for functions; the backend now does the same for `ADMIN_EMAILS` from `.env` files.

### Verification (2026-10-10)

- [x] `npm run typecheck`, `npm run functions:build`; every function's endpoint now has region `us-central1` and `maxInstances: 10`. The old build had neither: global options were silently ignored.
- [x] `npm test`: 76 passed (incl. 10 `accountPolicy`, 4 `routePattern`)
- [x] Rules tests: 31 passed. e2e (`deleteAccount`): 5 passed. Both ran on alternate emulator ports, beside an emulator suite already running on the defaults.
  - Covered: unauthenticated, wrong confirmation, moderator, a full purge (every row checked, friend's data intact, counters drop, audit row), and the "delete" word with no profile.
- [x] `npm run build`: `telemetry-*.js` is its own chunk, never preloaded. A canary debug token and another `VITE_` secret in `.env.production.local` do not appear in `dist/`.
- [x] Browser against the emulators:
  - no Google, Analytics or Performance requests; no consent slip; no visit checkbox on You;
  - sign up → onboarding (shows the "Delete this sign-in" link) → You → Delete my account;
  - the button stays disabled until the pen name matches; a wrong password shows a plain error;
  - the right password deletes the account, lands on the front page with "Your account and your writing have been removed.", and the auth user, pen name and audit row are as expected.
- [x] Consent slip (markup injected for a look): 16px gutters on narrow screens, a 380px slip bottom-left on desktop, no horizontal scroll.

### Review

- **Found while building:**
  - global function options were never applied;
  - `.env.local` never applied under `npm run dev`;
  - `import.meta.env` aliasing would have shipped every `VITE_` value;
  - `auth/wrong-password` / `auth/user-not-found` fell through to "Something went wrong";
  - a filed report left the leaver's uid in the queue aggregate (now scrubbed).
- **Not done:**
  - rate limiting;
  - a sweeper for stuck `pending` items;
  - an `auth.user().onDelete` trigger, or an admin purge script (the seed's `deleteUser` would race a trigger, so `updateUser` it first);
  - App Check enforcement (after metrics).

---

Plan: `/Users/darren/.claude/plans/pasted-content-id-5983-the-value-lively-dahl.md`

- [x] 1. Scaffold: Vite + React + TS, functions package, firebase.json / .firebaserc / emulators, styles, wash renderer ported to TS (worker)
- [x] 2. Moderation module + Vitest suite
- [x] 3. Firestore + Storage rules + rules tests
- [x] 4. Auth, `saveProfile`, onboarding, guards
- [x] 5. Content triggers, counters, live listeners → group talk, posts, comments, likes
- [x] 6. Seed script → Constellation chart + list view
- [x] 7. Connections + private notes (crisis path delivers with resources for both)
- [x] 8. Reports, review queue, admin callables, bootstrap / grant-admin
- [x] 9. Professional applications, licensed mark, ban flow
- [x] 10. README, PRODUCT.md update, review

## Verification

- [x] `npm test`: 55 tests (moderation incl. false-positive traps and evasions, constellation layout, pair ids)
- [x] `npm run test:rules`: 31 tests (forged status/author/badge, pending visibility, non-members, double likes, verification gates, DMs, bans, applications, friendships, Storage owner/type/size/write-once)
- [x] `npm run build`: passes; vendor chunks split, Review page lazy-loaded
- [x] End-to-end in the browser against emulators:
  - sign up, pen-name validation, onboarding
  - join, leave, rejoin a group
  - talk message goes "checking…" then published
  - crisis post held with resources; like; comment; report
  - email confirmation; accept a connection; private note
  - crisis private note delivered with resources on both sides
  - Review queue: crisis item first; remove spam; keep a reported comment
  - open a licence document via the rules; approve a licence
  - ban: account disabled, memberships removed, audit log written
  - professional application with upload
- [x] 375px: no horizontal scroll on any main page
- [x] Console clean in normal use

## Review

- **Found in testing:**
  - The seed's report was correctly dropped, because the reporter couldn't see the group.
  - Wiping the emulator re-fired counter triggers, which resurrected deleted posts. Counters now use `update`, never `set`.
  - Joining a group raced the server, so member-only listeners opened before the membership was confirmed and the SDK asserted. Listeners now wait for the server.
  - Curly apostrophes slipped past the crisis phrases. They are now normalised.
- **Spec gap closed:** "see who is friends with who" needed public friendships. Accepted connections are mirrored to `friendships/` by a function; requests and blocks stay private.
- **Known dev-only issue:** reseeding while the app is open can break the Firestore client until reload (documented in README).
- **Not done:**
  - deploy to a real project (needs the user's Firebase project);
  - rate limiting, App Check, account deletion, a sweeper for stuck `pending` items.

---

## Earlier: Value Study sample boards (done)
Four boards + index in `samples/`. Sampled tokens, granulating wash renderer (worker), contrast / mobile / focus / reduced-motion verified.
