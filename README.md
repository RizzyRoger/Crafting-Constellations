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

`npm test` covers the moderation rules, the constellation layout, and helpers. `npm run test:rules` runs the Firestore and Storage security rules against the emulators (stop `npm run emulators` first; it uses the same ports).

## Connect a real Firebase project

1. Create a project in the Firebase console and switch it to the **Blaze** plan (Cloud Functions need it).
2. **Authentication** → enable **Email/Password** and **Google**. Turn on email enumeration protection.
3. Create **Firestore** (location `nam5`, matching the functions region `us-central1`) and **Storage**.
4. **Project settings → Your apps → Web app**: copy the config into `.env.local` (see `.env.example`) and set `VITE_USE_EMULATORS=false`.
5. Put the moderator emails in `functions/.env.<project-id>`:

   ```
   ADMIN_EMAILS=you@example.com
   ```

6. Link the CLI to the project:

   ```bash
   npx firebase login
   ```

   ```bash
   npx firebase use --add
   ```

7. Build and deploy:

   ```bash
   npm run build
   ```

   ```bash
   npx firebase deploy --only firestore,storage,functions,hosting
   ```

8. Sign in with a listed email, confirm it, open **Review** and press "I'm on the moderator list".

Moderators open licence documents with `getBlob`, which needs a CORS rule on the Storage bucket for your site's origin.

## How it fits together

| Area | Where |
| --- | --- |
| Auto-moderator (word lists, crisis phrases, links, contact details) | `functions/src/moderation/` (shared with the client as a preview) |
| Publishing, holding, counters, reports, admin actions | `functions/src/` |
| Who can read and write what | `firestore.rules`, `storage.rules` |
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
