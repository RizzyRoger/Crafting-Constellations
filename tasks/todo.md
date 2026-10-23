# Crafting Constellations — web app (Firebase)

## Bug sweep, looped until dry (2026-10-10)

Baseline: typecheck, functions build, unit 133, rules 48, deleteAccount e2e 5, local-backend e2e 11 (emulators on ports +20000, beside the main checkout's suite).

- [ ] Each round: parallel finders by area and by cross-cutting lens → dedupe against everything already judged → 2 skeptics per finding (tiebreaker on a split) → fix confirmed bugs in disjoint file groups, with tests → adversarial review of each fix → all suites
- [ ] Stop when a full round confirms nothing new

### Round 1 (synced with main at 76900df first)

- 15 finders: 133 raw findings → 85 unique → 79 confirmed, 6 refuted.
- Refuted, and left as they are:
  - a block doesn't reach into group chats a mutual friend makes (blocks are one-to-one by design);
  - chat names use the pen-name rules (documented in ae096f1);
  - the client's call timer starts after the write lands (the TTL still does its job);
  - the wide-screen person sheet floats over the chart (deliberate);
  - the chart briefly renders before memberships arrive (no visible harm);
  - a banned person's token can read private notes until it expires (bans stop writing; reads stay one-to-one).
- Fixed in 45 groups with file locks; each fix got an adversarial review (and up to two repairs) before it counted.
  - All 79 confirmed bugs fixed, plus 19 follow-ups (F1–F19) that reviewers verified while reviewing; one was a regression (Report's confirmation stopped being announced in talk).
  - After the last review, a narrower clause split still lost five disguised crisis lines the original code caught; the reviewer's tested fix keeps the old clause lines and adds the tighter split on top (with a regression test).
  - Checks: unit 133 → 826; rules 48 → 69; functions e2e 5 → 22; local-backend e2e 11 → 34; `tsc -b`, functions build and `vite build` clean.
  - For the PR: existing pen names that the tighter reserved-word and lookalike checks now refuse (e.g. "nurse2joy") must be renamed at the next profile save; the form says why.
  - Interruptions: the session dropped several times. Workflow resume only replays an unbroken prefix of finished calls, so each restart rebuilt every group's state from the agent journals and relaunched with explicit starting points (review, repair or finish).
  - Found while fixing: `npm run build` (`tsc -b`) broke once tests under `src/` imported components. They now have their own `tsconfig.test.json` (DOM + Node + Vite types), and `src/lib/blocks.ts` no longer pulls browser code into the Node project.
  - Left as they are: an unreachable "withdraw refused" alert in `Item.tsx` (the item unmounts first; harmless), and the per-pair block race (the first to block owns the pair; a limit of the existing design, and victims are still better off).
- Decisions made:
  - a revoked professional may apply again;
  - the profile note's hint now says everyone signed in can see it (no data move);
  - removing a moderator revokes their sign-in, with no new rules lookup (the delay that remains is documented);
  - Performance Monitoring's addresses are described truthfully.

## Notifications, @mentions, seamless paper, draggable chart (2026-10-10)

Plan: `/Users/darren/.claude/plans/i-want-you-to-quiet-stardust.md`

- [x] 0. Synced with main (7099d22: private group chats)
- [x] 1. Paper grain tiles without seams (filter region pinned to the tile). Mottle tile edge step: 32× the inside step before, ordinary noise after (81st–90th percentile of its own rows/columns)
- [x] 2. Notifications + @mentions
  - [x] shared `mentions.ts` (+ tests)
  - [x] server: `notify.ts` in `handleNewContent` and `approveContent`; accepted notices (function + local backend); purge; rules; index
  - [x] client: Composer autocomplete, `MentionText`, Notifications page, rail link, Me cleanup; seed gives `SEED_ME_UID` a mention
  - [x] tests: unit 115, rules 48, local-backend e2e 10, deleteAccount e2e 5
  - [x] browser (own emulators on other ports, two people): @ list by keyboard and pointer, highlight from the server, comment / mention / accepted notices, opening one marks it read, Mark all read, withdrawn → "No longer here", 375px no sideways scroll
  - Found while checking: reading a withdrawn item's document (or a query pinned to its id) is refused, and the refused listen broke the Firestore client. Excerpts now ask for "published at this time" (`contentAt`).
- [x] 3. Draggable Friends chart (spring physics, your dot fixed)
  - `egoPhysics.ts`: line springs at their drawn length, a push between dots (capped up close), you pinned; settled before the first paint; a dropped dot keeps its new angle, not its old place (no pull home, like Obsidian)
  - browser at 393px: a real mouse drag lands under the pointer, neighbours follow, release drifts to rest (~6s at most), the drag doesn't open the sheet, a click still does, your dot can't move; labels kept inside the edges
  - Found while checking: a quick drag can end before the next frame, so the held dot is placed on each move, not only per frame
- [x] 4. Verify: typecheck, functions build, unit 124, rules 48, local-backend e2e 10, deleteAccount e2e 5, build; browser as above. Run on separate emulator ports beside the main checkout's suite.

### Review

- **Delivered:** seamless paper; Notifications page (requests, mentions, comments on your posts, accepted requests, moderator notes) with an unread count in the rail; @mentions in group talk, posts, comments and private group chats; draggable Friends chart.
- **Decisions:** pings are checked and written by functions when writing is published (held writing pings nobody until approved); notices hold no copy of the words; moderator notes moved from You to Notifications; DMs have no @ (both people already see every line); the chart has no pull back home, so a dropped dot keeps its new angle.
- **Fixed before the PR (user: "fix the bugs"):**
  - the local backend now announces acceptances from the last 3 days on start (`acceptedWhileAway`; the notice id makes each one once only), e2e covered;
  - automod read a word-initial `@` as "a", so "love you @Loser" slipped past where "love you Loser" is held. A fourth view drops that `@` (`unmarked`); "@ss"-style leet is still read by the old view. Probed: no real pen name is newly held by it;
  - merged main with `fill-app-panes` (PR #5, full-height panes): no conflicts; the @ list opens inside the pane, on top of the chat, unclipped (checked in the browser).
- Verified after: unit 133, rules 48, local-backend e2e 11, deleteAccount e2e 5, typecheck, both builds.
- [x] NUC bundle `crafting-constellations-backend.tgz` (gitignored, same layout as before: `functions/` source + `.env.local` + the moderator list, built on the NUC). New since the last bundle: notifications, mentions, and private chats (#4). Checked from a clean unpack: `npm ci` + build, then run as its own process on the emulators: a mentioned comment published with `mentioned`, a mention notice and a comment notice.
- [ ] User: deploy rules + indexes, then hosting, then the NUC bundle (PR #6 says why).

## Reach out, Accept, and private group chats (2026-10-10)

Plan: `/Users/darren/.claude/plans/this-site-is-looking-giggly-robin.md`

- [x] Accept: unverified recipients see "Confirm your email to accept" instead of a silent grey button; a confirmation made in another tab is picked up on focus
- [x] Reach out: removed the symmetric "friend's friend" lockout (both people were told the other would connect first)
- [x] Constellation waits for connections before offering Reach out; leftover debug beacons removed
- [x] Private group chats: `createChat` callable (accepted connections only, up to 20), `chats/{id}/messages` rules, moderation, reports, review queue, ban cleanup
- [x] New chat page, chat page with Leave, chats listed under Group Chats in the rail; group Talk extracted and shared
- [x] After merging Go live: `createChat` uses `callable()` (App Check flag); account deletion takes the person off their chats (e2e covered)

### Verification

- [x] `npm test`: 65 passed; `npm run build` and functions build pass
- [x] Rules: 39 passed (new: unverified recipient can't accept; chats read/list, client create, member writes, leave-only-yourself, reportable)
- [x] Browser against an isolated emulator suite:
  - friend's friend reach out → accept
  - unverified Accept hint → verify → Accept appears on focus → accepted
  - create chat → publish → member reads → non-member refused → leave
  - crisis note in a chat is delivered with resources and queued at priority 2
  - 375px: no horizontal scroll

### Review

- **Found in testing:** one Firestore SDK internal assertion (ID ca9: a watch target's pending count went below zero). It appeared once during a sign-in-and-leave sequence. It didn't come back in 30 targeted retries of leave and sign-in/out, so no code was changed for it.
- **Follow-ups:** add people to an existing chat; rename a chat.

---

## Go live: real project, craftingconstellations.com, App Check, Analytics/Perf, account deletion

Plan: `/Users/darren/.claude/plans/can-you-add-full-eager-metcalfe.md`

- [x] 1. Functions foundation: `options.ts` (global options that actually apply), `callable()` with the App Check flag
- [x] 2. Account deletion (server): `accountPolicy` + tests, `account.ts` purge, `likes.uid` index, hardening
- [x] 3. App Check in the client, typed env
- [x] 4. Analytics + Performance, opt-in; Analytics gets route patterns only (Performance sends real addresses, corrected in the 2026-10 bug sweep)
- [x] 5. Account deletion (client): `/delete-account`, links from Me and Onboarding
- [x] 6. Go-live config (prod alias + web.app CORS origin wait for the project id): env files, CORS, hosting cache headers, deploy scripts, env check; remove `CNAME`
- [x] 7. Docs: README, lessons
- [x] 8. Verify: typecheck, unit, rules, e2e (deleteAccount), build, emulator browser pass
- [ ] 9. With the user: console setup, keys, deploy (Spark now; Blaze later)
  - [x] Project `crafting-constellations-bf029`; web config in `.env.local`; `prod` alias; moderator list
  - [x] Firestore `(default)` in nam5; rules + indexes deployed
  - [x] Hosting live at https://crafting-constellations-bf029.web.app. Checked: headers, deep links, no Analytics before consent, route patterns only after (Analytics; Performance sends real addresses).
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
- [x] Live test: a pen name saved through the NUC (1 profile, matching pen name, no leftover calls)
- [x] Merged main (91616de: landing story, a confirmed email to write, flood hold with `rateLimits`):
  - conflicts resolved: App Check uses Roger's reCAPTCHA v3 provider with my init order and env hygiene; Roger's landing plus the "account removed" line, repositioned for his fixed buttons;
  - `rateLimits/{uid}` is now purged on account deletion;
  - after the merge: unit tests 80, rules 36, deleteAccount e2e 5, local-backend e2e 6, both builds; landing checked at 297px and 1280px.
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
