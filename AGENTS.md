# AGENTS.md

## Cursor Cloud specific instructions

This repo is a static **download website** (Vite + vanilla JS) that uses
**Firebase** for email/password auth (with email verification) and Firestore
storage. See `README.md` for the full setup/run docs and the `scripts` block in
`package.json` for exact commands. Notes below are the non-obvious caveats.

### Services

- **Vite dev server** — `npm run dev` (http://localhost:5173).
- **Firebase Emulator Suite** — `npm run emulators`: Auth (9099), Firestore
  (8080), Emulator UI (http://127.0.0.1:4000). Requires Java (preinstalled).
- Start both together with `npm run dev:all`.

### Non-obvious caveats

- **Local dev needs no real Firebase project or credentials.** In Vite dev mode
  the app auto-connects to the local emulators using the demo project
  `demo-quant-downloads` (see `src/firebase.js`). Firebase web API keys are not
  secrets; access is controlled by `firestore.rules`.
- **Emulators do not send real email.** To verify an account in local dev, do
  one of:
  - Programmatic (deterministic, best for tests): grab the code from
    `GET http://127.0.0.1:9099/emulator/v1/projects/demo-quant-downloads/oobCodes`
    then
    `POST http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`
    with body `{"oobCode":"<code>"}`.
  - Or open the `oobLink` from that oobCodes endpoint **once** — it is a
    single-use link; visiting it twice shows "expired or already used".
  - Or toggle "Verified email" in the Auth Emulator UI (http://127.0.0.1:4000/auth).
  In production (real Firebase project), `sendEmailVerification()` sends a real
  email.
- **Passwords are never stored by the app.** Firebase Auth salts + hashes them
  server-side; Firestore only holds non-sensitive profile/download data.
- **Emulator data is in-memory** and resets on emulator restart. Clear it while
  running via `DELETE .../emulator/v1/projects/demo-quant-downloads/accounts`
  (Auth, port 9099) and
  `DELETE .../emulator/v1/projects/demo-quant-downloads/databases/(default)/documents`
  (Firestore, port 8080).
- Hot reload: Vite reloads JS on save; the Firestore emulator reloads
  `firestore.rules` on save automatically.
- There is no automated test suite or linter configured; verify changes by
  running the app against the emulators (see the flow in `README.md`).

### Deployment

- The live site (`https://quantllc.github.io/`, once the repo is renamed to
  `quantllc.github.io`) is deployed by
  `.github/workflows/deploy.yml` on push to `main` (builds Vite, publishes
  `dist/` to GitHub Pages). Pages **Source** must be set to "GitHub Actions" once
  in repo settings.
- `vite.config.js` `base` is `/` — correct for an org page served at the domain
  root. It would need to change only for a project page served under a subpath.
- Production auth requires real Firebase config via `VITE_FIREBASE_*` build-time
  env vars (set as Actions **Variables**). Without them the deployed site loads
  but shows a "not configured" notice and sign-in is disabled — this is expected,
  not a bug.
