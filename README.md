# Quant Downloads

A download website with an email + password authorization page. Emails must be
**real and verified** (a verification link is emailed on sign-up) before a user
can access downloads. User records are stored automatically in a database.

Built as a static site (deployable to GitHub Pages) using
[Firebase](https://firebase.google.com/) for authentication and storage:

- **Firebase Authentication** — email/password sign-up & sign-in. Passwords are
  salted + hashed by Firebase; we never store raw passwords.
- **Email verification** — `sendEmailVerification()` sends a real link; downloads
  are gated on `emailVerified`.
- **Cloud Firestore** — user profiles and download events are stored
  automatically.

## Tech stack

- [Vite](https://vitejs.dev/) dev server / bundler
- Vanilla JS + the modular Firebase Web SDK
- Firebase Emulator Suite for local development (no cloud project needed)

## Local development

Requires Node.js 18+ and Java 11+ (for the Firebase emulators).

```bash
npm install
npm run dev:all      # starts the Firebase emulators AND the Vite dev server
```

Then open the app (Vite prints the URL, default http://localhost:5173).
The Firebase Emulator UI is at http://127.0.0.1:4000 — use its **Auth** tab to
find verification links (the emulators do not send real email).

You can also run the two processes separately:

```bash
npm run emulators    # Auth (9099), Firestore (8080), Emulator UI (4000)
npm run dev          # Vite dev server (5173)
```

In development the app auto-connects to the emulators, so **no real Firebase
credentials are required**.

## Deploying to GitHub Pages (quant.github.io)

This repo is a GitHub Pages **org site**, so it is served at the domain root
`https://quant.github.io/`. Deployment is automated by
`.github/workflows/deploy.yml`, which builds the Vite app and publishes `dist/`
on every push to `main`.

One-time setup:

1. In the repo, go to **Settings → Pages → Build and deployment → Source** and
   choose **GitHub Actions**.
2. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually). The
   site will come up at https://quant.github.io/.

The site will load without any Firebase config, but sign-in stays disabled and a
notice is shown until you configure Firebase (below).

### Enabling accounts on the live site

1. Create a Firebase project; enable **Email/Password** auth and **Firestore**.
2. Add your project's web config as repository **Variables** (not secrets — these
   values are safe to expose) under **Settings → Secrets and variables → Actions
   → Variables**: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
   `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
3. Add `quant.github.io` under Firebase Auth → Settings → **Authorized domains**.
4. Deploy the Firestore rules in `firestore.rules` to your project.
5. Re-run the deploy workflow so the config is baked into the build.

For local production testing, copy `.env.example` to `.env.local`, fill in the
values, then `npm run build && npm run preview`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run emulators` | Firebase Auth + Firestore emulators + UI |
| `npm run dev:all` | Both of the above together |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
