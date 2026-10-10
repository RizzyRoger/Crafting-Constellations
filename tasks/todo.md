# Crafting Constellations — web app (Firebase)

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
