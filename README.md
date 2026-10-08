# Xspec Flight Lab

## Start the app

Use Node.js 22 or newer, then run:

```sh
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

## Enable email sign-in

Account creation and sign-in use one-time email codes. The server sends them through [Resend](https://resend.com/). The API key stays on the server and is never sent to the browser.

1. Create a Resend API key and verify a sender domain/address.
2. Copy `.env.example` to `.env`.
3. Set `RESEND_API_KEY`, `AUTH_FROM_EMAIL`, and a long random `AUTH_CODE_SECRET` in `.env`.
4. Restart `npm run dev`.

Without those server settings, email verification cannot complete, so a new visitor cannot pass the sign-in screen. The server shows a configuration message when a code is requested. Do not commit `.env`.

Verified accounts and hashed session tokens are stored in `.data/accounts.json` for this local, single-server prototype. Deployments that need multiple server instances should use a shared database and HTTPS; set `COOKIE_SECURE=true` when HTTPS is terminated by a trusted reverse proxy.

## Flight parties and multiplayer

Sign in, open **Flight Crew**, then create a private party and share its six-character invite code. Parties support four pilots total. **Quick Match** joins an open lobby, while the party host can stage a synchronized crew-race start. Every pilot must use the same reachable Xspec server; the default development server only listens on the local machine. Party state is stored with the single-server account data.

Tournament mode stays locked until a future event is scheduled. Set `XSPEC_TOURNAMENT_STARTS_AT` in `.env` to an ISO-8601 timestamp in the future; `XSPEC_TOURNAMENT_TITLE` sets its display name. The server unlocks Tournament mode while that start time is still upcoming and locks it again after the event start time passes. Restart the server after changing these settings.

## Track builder assets

The builder has procedural gate previews and loads matching GLB models from `public/models/gates/` when present: `single.glb`, `corkscrew.glb`, `ladder.glb`, `dive.glb`, `flag.glb`, and `hurdle.glb`. Model files should use meters, Y-up, and a ground-centered origin; the course editor controls placement, height, rotation, and scale. Missing files keep using the procedural preview.

## Production build

```sh
npm run build
npm start
```
