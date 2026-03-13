# Heart Beater MC

A BPM-triggered Spotify playlist switcher. A Garmin Connect IQ watch app
POSTs live heart rate to a local Express server every 5 seconds. The server
evaluates BPM threshold rules stored in SQLite and calls the Spotify Web API
to switch playback when your heart rate crosses a rule boundary.

## How it works

1. You define BPM threshold rules in the browser dashboard (e.g. "above 140
   BPM, play this high-intensity playlist").
2. You start a workout on your Garmin watch. The sideloaded DataField app
   reads `Activity.Info.currentHeartRate` and POSTs it to the server every
   5 seconds via HTTPS (tunnelled through ngrok).
3. The server validates the request, evaluates your rules (picking the
   highest matching threshold), and calls `/me/player/play` on the Spotify
   Web API when the active rule changes.
4. The browser dashboard shows live BPM, the currently active rule, and
   now-playing info over Server-Sent Events — but the music-switching
   pipeline works without the dashboard open.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 20 | Server and client both require Node 20+ |
| npm | >= 10 | Bundled with Node 20 |
| Garmin Connect IQ SDK | >= 7.x | Required for manual CIQ compilation only |
| ngrok | Any | Free tier is sufficient; HTTPS tunnel required for Android |
| Spotify Premium account | - | Required for `/me/player/play` playback control |
| Spotify Developer app | - | Needed to obtain `client_id` and `client_secret` |

---

## Installation

Clone the repository and install dependencies for both the server and client:

```bash
git clone https://github.com/mkaraivanov/heart-beater-mc.git
cd heart-beater-mc

# Server dependencies
cd server && npm install && cd ..

# Client dependencies
cd client && npm install && cd ..
```

---

## Environment variables

Copy `.env.example` to `.env` in the project root and fill in every value:

```bash
cp .env.example .env
```

Open `.env` and set:

```
# Spotify OAuth (standard Authorization Code flow — NOT PKCE)
SPOTIFY_CLIENT_ID=<your Spotify app client ID>
SPOTIFY_CLIENT_SECRET=<your Spotify app client secret>
SPOTIFY_REDIRECT_URI=http://localhost:3001/auth/spotify/callback

# BPM endpoint shared secret — must match the constant in the CIQ source
# Generate with: openssl rand -hex 32
BPM_API_KEY=<random hex string>

# SQLite database path (relative to /server)
DATABASE_URL="file:./prisma/dev.db"

# Express port (default 3001)
PORT=3001

# React dev server origin for CORS (default http://localhost:5173)
CLIENT_ORIGIN=http://localhost:5173

# Active ngrok tunnel URL — update this each time ngrok restarts
NGROK_URL=https://<your-subdomain>.ngrok.io
```

Never commit `.env` to version control. The `.env.example` file (committed)
documents required variables with placeholder values only.

---

## Spotify OAuth setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create a new app (any name, any description).
3. In the app settings, add the following Redirect URI:
   ```
   http://localhost:3001/auth/spotify/callback
   ```
4. Copy the **Client ID** and **Client Secret** into `.env`.
5. Start the server (see below), then open:
   ```
   http://localhost:3001/auth/spotify/login
   ```
   Authorise the app in the Spotify consent screen. The server stores the
   access token and refresh token in SQLite automatically.
6. Tokens are refreshed automatically before every Spotify API call — you
   should not need to re-authorise unless you revoke access.

---

## Database setup

Run Prisma migrations to create the SQLite database:

```bash
cd server
npx prisma migrate deploy
```

For development (auto-creates the DB if it does not exist):

```bash
cd server
npx prisma migrate dev
```

---

## Running the app

Open two terminal windows.

**Terminal 1 — server** (port 3001):
```bash
cd server
npm run dev
```

**Terminal 2 — client** (port 5173):
```bash
cd client
npm run dev
```

Open the dashboard at `http://localhost:5173`.

Additional dev commands:

```bash
# Type-check both workspaces
npm run typecheck   # from /server or /client

# Run tests
cd server && npm test
```

---

## ngrok setup

Garmin Connect on Android requires HTTPS for `makeWebRequest` calls. ngrok
provides a free HTTPS tunnel to your local server.

1. [Sign up for a free ngrok account](https://ngrok.com/) and install the
   CLI.
2. Authenticate the CLI:
   ```bash
   ngrok config add-authtoken <your-authtoken>
   ```
3. Start a tunnel to the server port:
   ```bash
   ngrok http 3001
   ```
4. Copy the HTTPS forwarding URL (e.g.
   `https://abc123.ngrok.io`) and set it as `NGROK_URL` in your `.env`.
5. Update the `SERVER_URL` constant at the top of
   `garmin/source/HeartBeaterApp.mc` to match:
   ```monkey-c
   const SERVER_URL as String = "https://abc123.ngrok.io/api/bpm";
   ```
6. After updating the URL, recompile and re-sideload the CIQ app (see below).

Note: on the free tier the ngrok URL changes every time you restart the
tunnel. Each change requires updating `SERVER_URL` in the CIQ source,
recompiling, and re-sideloading. A paid ngrok plan or a local HTTPS setup
with `mkcert` avoids this.

---

## CIQ app: compilation and sideloading

The Garmin Connect IQ watch app lives in `garmin/`. It is written in Monkey C
and must be compiled and sideloaded manually — the CIQ SDK compiler cannot be
run from this project's npm scripts.

### One-time setup

1. Download and install the
   [Garmin Connect IQ SDK](https://developer.garmin.com/connect-iq/sdk/).
2. Install the
   [VS Code Connect IQ extension](https://marketplace.visualstudio.com/items?itemName=garmin.monkey-c)
   (optional but recommended for syntax highlighting and the device simulator).
3. Generate or obtain a developer key:
   ```bash
   openssl genrsa -out developer_key.pem 4096
   openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem \
     -out developer_key.der -nocrypt
   ```
   Keep `developer_key.pem` safe — you need it for every build.

### Configure the CIQ source

Before compiling, open `garmin/source/HeartBeaterApp.mc` and set the two
constants at the top of the file:

```monkey-c
const SERVER_URL  as String = "https://<your-ngrok-url>/api/bpm";
const BPM_API_KEY as String = "<value of BPM_API_KEY from .env>";
```

These values are compiled into the app binary. Any change to either constant
requires a new build and re-sideload.

### Compile

Replace `<device-id>` with the ID for your Garmin model (e.g. `fenix7`,
`forerunner955`). The full device list is in `garmin/manifest.xml`.

```bash
cd garmin
monkeyc \
  -f monkey.jungle \
  -o bin/HeartBeaterApp.prg \
  -d <device-id> \
  -y /path/to/developer_key.der
```

For a full list of supported device IDs, run:
```bash
monkeyc --devices
```

### Simulate (optional)

To test in the Connect IQ simulator before sideloading:

```bash
monkeydo bin/HeartBeaterApp.prg <device-id>
```

The simulator console (`System.println` output) appears in the CIQ simulator
window. Use this to verify POST responses.

### Sideload onto the watch

**Via USB (Garmin Express):**

1. Connect your watch to your computer with the USB cable.
2. Open Garmin Express and wait for it to detect the device.
3. Copy `garmin/bin/HeartBeaterApp.prg` to the watch at:
   ```
   GARMIN/Apps/HeartBeaterApp.prg
   ```
4. Safely eject the watch.

**Via Garmin Connect app (Bluetooth):**

1. On your phone, open the Garmin Connect app.
2. Navigate to More > Connect IQ Store > My Apps.
3. Sideload by following the Garmin developer sideload guide for your
   platform.

### Add the DataField to an activity profile

1. On the watch, go to Settings > Activity Profiles > (your profile) >
   Data Screens.
2. Add a new data screen and select the Heart Beater MC DataField.
3. The field displays your current BPM and begins POSTing when the activity
   timer starts.

---

## Configuring BPM rules

1. Open the dashboard at `http://localhost:5173/rules`.
2. Click "Add rule" and enter:
   - BPM threshold (integer, unique — e.g. 140)
   - Spotify URI (paste from Spotify: right-click a playlist/album/track,
     Share > Copy Spotify URI)
   - Content type: `playlist`, `album`, or `track`
   - Label (e.g. "High intensity")
3. Rules are evaluated in descending BPM order. The highest rule whose
   threshold is at or below your current BPM becomes active.
4. When BPM drops below all thresholds, the current music keeps playing —
   the server never pauses Spotify on its own.

---

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Server health check |
| GET | `/auth/spotify/login` | None | Start Spotify OAuth flow |
| GET | `/auth/spotify/callback` | None | OAuth callback (Spotify redirects here) |
| GET | `/api/rules` | None | List all BPM rules |
| POST | `/api/rules` | None | Create a rule |
| PUT | `/api/rules/:id` | None | Update a rule |
| DELETE | `/api/rules/:id` | None | Delete a rule |
| POST | `/api/bpm` | `X-BPM-Key` header | Receive BPM from Garmin watch |
| GET | `/api/stream` | None | SSE stream for live dashboard |
| GET | `/api/spotify/search` | None | Proxy Spotify search |

The `POST /api/bpm` endpoint requires the `X-BPM-Key` request header to
match `BPM_API_KEY` in your `.env`. Requests without a valid key are
rejected with HTTP 401. This endpoint is exposed to the public internet via
ngrok, so this check is security-critical.

---

## Known limitations

### Server restart clears in-memory state

The server holds `currentBpm`, `activeRuleId`, `sessionActive`, and
`lastSwitchAt` in Node.js process memory. If the server restarts during a
workout (crash, `nodemon` reload, etc.), this state is lost.

Behaviour after a restart:
- The watch continues POSTing BPM regardless — it has no knowledge of server
  state.
- The next incoming POST re-establishes the session and evaluates rules from
  scratch.
- This may cause a momentary re-trigger of the current threshold rule even if
  that playlist was already playing.

This is a known v1 limitation. Avoid restarting the server during a workout.

### ngrok URL changes on free tier

Each time you stop and restart the ngrok tunnel, a new random URL is assigned.
You must update `SERVER_URL` in `garmin/source/HeartBeaterApp.mc`, recompile,
and re-sideload the CIQ app. A paid ngrok plan with a stable subdomain, or a
local HTTPS setup using `mkcert`, avoids this.

### 15-second cooldown between Spotify switches

To prevent rapid playlist switching during BPM oscillation near a threshold
boundary, the server enforces a 15-second cooldown between consecutive Spotify
calls. During this window, incoming BPM data is still processed and state is
updated, but no Spotify API call is made. The switch fires on the next BPM
POST after the cooldown expires.

### Spotify requires an active playback device

`PUT /me/player/play` requires Spotify to have an active Connect device
(phone, desktop app, etc.). If no device is active — for example because
Spotify was closed — the API returns a 404 and no playback change occurs. Open
Spotify on your preferred device and play something before starting a workout.

### CIQ app must be recompiled after any configuration change

`SERVER_URL` and `BPM_API_KEY` are compiled into the watch app binary as
constants. Changing either value in `.env` or `.mc` source requires a full
recompile and re-sideload. There is no over-the-air update mechanism.

### makeWebRequest error -2 (BLE drop)

On some Garmin watches the watch-to-phone BLE connection drops briefly during
intense activity, causing `makeWebRequest` to return error code `-2`. The CIQ
app implements exponential backoff (1 s, 2 s, 4 s, max 3 retries) to handle
this automatically.

### Single-user only

This is a personal hobby tool. The database schema, OAuth token storage, and
in-memory state all assume a single user. Multi-user support is out of scope
for v1.

---

## Project structure

```
/server         Express API, threshold engine, SSE broadcaster, Prisma ORM
  /src
    index.ts            Entry point (port 3001)
    state.ts            In-memory BPM/session state
    thresholdEngine.ts  Rule evaluation logic
    sessionWatchdog.ts  Auto-ends stale sessions after inactivity
    /routes             bpm.ts, rules.ts, auth.ts, spotify.ts, stream.ts
    /spotify            client.ts — all Spotify API calls + token refresh
    /sse                broadcaster.ts — SSE push to dashboard tabs
  /prisma
    schema.prisma       BpmRule + OAuthToken models
    migrations/         Prisma migration history

/client         React + Vite + Tailwind CSS SPA (port 5173)
  /src
    /views              Dashboard.tsx, Rules.tsx
    /hooks              useServerEvents.ts (SSE)
    /api                client.ts (fetch wrappers to :3001)

/garmin         Connect IQ watch app (Monkey C) — manual build required
  /source
    HeartBeaterApp.mc   DataField: reads HR, POSTs to server every 5 s
  manifest.xml          App metadata, supported devices, permissions
  monkey.jungle         CIQ build descriptor

/.env.example   Required environment variable placeholders (committed)
/README.md      This file
```

---

## Troubleshooting

**Spotify OAuth fails with "redirect URI mismatch"**
Ensure the Redirect URI in your Spotify Developer Dashboard exactly matches
`SPOTIFY_REDIRECT_URI` in `.env`, including the protocol and port.

**Watch app shows no data / BPM stops updating**
Check that:
- The ngrok tunnel is running and `SERVER_URL` in the CIQ source matches the
  current tunnel URL.
- The server is running on port 3001.
- The `X-BPM-Key` constant in the CIQ source matches `BPM_API_KEY` in `.env`.
- The DataField is added to the active workout profile data screen.

**Server returns 401 on POST /api/bpm**
The `X-BPM-Key` header does not match `BPM_API_KEY`. Rebuild the CIQ app
with the correct key constant and re-sideload.

**Spotify does not switch tracks**
- Confirm Spotify is open and playing on a device before starting the workout.
- Check the 15-second cooldown — switches are intentionally debounced.
- Verify rules are configured with valid Spotify URIs
  (`spotify:playlist:<id>`, `spotify:track:<id>`, `spotify:album:<id>`).
- Check the server console for Spotify API error messages.

**ngrok connection refused**
Make sure the server is running on the same port before starting ngrok, and
that no firewall blocks the port.
