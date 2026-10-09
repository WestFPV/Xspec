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

Sign in, open **Flight Crew**, then create a private party. From the Friends panel, use **INVITE** beside a friend to send an in-app invitation to your open party; invitees can accept it from **GAME INVITES**. You can also share the six-character party code. Empty podium shortcuts open Friends and Recent Players; recent pilots are kept per browser and limited to eight. **Quick Match** joins an open lobby, while the party host can stage a synchronized crew-race start. Every pilot must use the same reachable Xspec server; the default development server only listens on the local machine. Party state is stored with the single-server account data.

Tournament mode stays locked until a future event is scheduled. Set `XSPEC_TOURNAMENT_STARTS_AT` in `.env` to an ISO-8601 timestamp in the future; `XSPEC_TOURNAMENT_TITLE` sets its display name. The server unlocks Tournament mode while that start time is still upcoming and locks it again after the event start time passes. Restart the server after changing these settings.

## Track builder assets

The Track Builder race-gate library uses four imported GLB models in `public/models/gates/`: `neon-square.glb`, `neon-ladder.glb`, `neon-flag.glb`, and `neon-hurdle.glb`. The models keep their authored scale; the editor only centers them horizontally and places their lowest point on the ground. The course editor controls placement, rotation, and scale. If a model cannot load, a procedural preview is shown instead. The Relay podium gate is a separate Builder prop and remains available in Relay mode.

## Production build

```sh
npm run build
npm start
```

## Free Cloudflare deployment

The project can run without a Node.js host on Cloudflare Workers Free. `worker.mjs` serves the built Vite site as static assets and routes the existing account, friend, team, community-track, leaderboard, and flight-party APIs through a SQLite-backed Durable Object. The Durable Object keeps the app data across requests and serializes API updates. It uses Cloudflare's free SQLite Durable Object allocation; it does not require a paid Workers plan.

The current setup is intended for a small launch. It stores the app state in one Durable Object, so requests share one serialized state store; a larger audience would need a more scalable data design. Cloudflare Free currently has daily Workers and Durable Objects request limits, plus an account-wide 5 GB SQLite Durable Objects storage limit. Static asset requests do not count against the Workers request quota. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), and [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

If traffic grows, monitor the Worker and Durable Object request/CPU/storage graphs in the Cloudflare dashboard. Static downloads are already free and unlimited. For API traffic, the next simplest step is Workers Paid (starting at $5/month, with metered overages); the next architecture step is to split lobbies into separate Durable Objects, move account/friend/team records into D1, and put community images in R2. D1 currently includes 5 million rows read/day and 100,000 rows written/day on Free, and R2 includes 10 GB-month storage, 1 million Class A operations/month, and 10 million Class B operations/month. Keep an eye on their separate quotas and pricing as usage grows.

1. Install dependencies and authenticate Wrangler with your Cloudflare account:

   ```sh
   npm install
   npx wrangler login
   ```

2. Create the Worker and upload the site:

   ```sh
   npm run cf:deploy
   ```

3. In the Cloudflare dashboard, open **Workers & Pages** → `xspec` → **Settings** → **Variables and Secrets**. Add these as secrets:
   - `AUTH_CODE_SECRET`: a long, unique random secret. Do not reuse a password.
   - `RESEND_API_KEY`: the API key for a verified Resend sender.
   - `AUTH_FROM_EMAIL`: the verified sender address.

   Email sign-in will return a configuration error until all three are set. Resend has a free tier with a daily sending limit; see [Resend pricing](https://resend.com/pricing).

4. To deploy future GitHub changes automatically, connect `WestFPV/Xspec` in Cloudflare Workers Builds and use `npm run build` as the build command and `npx wrangler deploy` as the deploy command. Set the same secrets for the production environment.

5. Add your domain as a custom domain in the Worker settings. Keep Cloudflare as the domain's DNS provider; no separate Node.js server is required.

This Cloudflare database starts empty and does not automatically import local `.data/accounts.json` data. Local `.data` remains on the development computer. The existing Node.js commands above continue to work for local development.
