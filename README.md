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

## Production

1. Create a Firebase project; enable Email/Password auth and Firestore.
2. Copy `.env.example` to `.env.local` and fill in your project's web config.
3. `npm run build` and deploy `dist/` (e.g. to GitHub Pages).

Deploy the Firestore rules in `firestore.rules` to your project.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run emulators` | Firebase Auth + Firestore emulators + UI |
| `npm run dev:all` | Both of the above together |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
