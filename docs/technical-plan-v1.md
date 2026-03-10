# Heart Beater MC
## Technical Implementation Plan
**Version 1.1 | March 2026 | Hobby Project**

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-03-08 | Initial draft |
| 1.1 | 2026-03-09 | Changed Spotify OAuth from PKCE to standard Authorization Code flow with client secret. Added BPM endpoint authentication (shared secret via `X-BPM-Key` header). Added threshold switch cooldown (15s debounce). Defined below-all-thresholds behaviour (continue playing, don't pause). Added Spotify 429 rate-limit handling. Clarified dashboard is optional during workouts. Documented server-restart mid-workout behaviour. Noted Connect IQ SDK cannot be compiled by Claude Code. |

---

## 1. Executive Summary

This document analyses the Business Requirements v1.1 for the Heart Beater MC application — a personal tool that switches Spotify playback in real-time based on live heart rate data from a Garmin wearable. It evaluates the proposed tech stack, identifies technical risks, and recommends a concrete implementation path.

The most significant finding is a critical risk in the Garmin data layer. The original BRD assumed the Garmin Health API can deliver live, sub-10-second heart rate data. This is incorrect. The recommended replacement architecture uses a small Connect IQ watch app to push BPM directly to the local server — a well-documented hobby approach that has been proven to work. This changes the Garmin layer from a cloud OAuth integration to a local HTTP receiver, which also simplifies the backend considerably.

With this change, the recommended stack diverges meaningfully from the original BRD suggestion, trading Next.js for a lighter Node.js/Express server. The rationale is detailed below.

---

## 2. Critical Risk: The Garmin Data Layer

> ⚠️ **BLOCKER** — The Garmin Health API cannot provide live, sub-10-second heart rate data. This is the single biggest technical risk in the original BRD and must be resolved before any other implementation decisions.

### 2.1 What the Garmin Health API Actually Does

The original BRD proposed "OAuth 2.0 login with Garmin Connect" and a polling loop reading live BPM every 5–10 seconds. This is not possible with the Garmin Health API. The API is a business-tier product with the following properties:

- Access requires a formal application and approval by Garmin for business developers, not individuals.
- Data is not available in real-time. It is synced from the device to Garmin Connect cloud after the activity ends (or at manual sync events), meaning latency to the API is measured in minutes to hours, not seconds.
- It uses a webhook push architecture where Garmin sends data to your server after sync — there is no pull/polling endpoint that returns live BPM during a workout.

The BRD's NFR-01 requires playback switching within 10 seconds of a threshold crossing. The Garmin Health API cannot satisfy this requirement.

### 2.2 The Viable Alternatives

| Approach | Latency | Complexity | Verdict |
|---|---|---|---|
| Garmin Health API (original BRD proposal) | Minutes–hours after sync | High (needs business approval) | ❌ Not viable |
| Garmin LiveTrack stream parsing | ~4 sec refresh | Medium (unofficial, fragile) | ⚠️ Risky |
| Connect IQ watch app + HTTP POST | 1–5 seconds | Medium (requires CIQ development) | ✅ Recommended |
| Garmin ANT+/BLE broadcast | Real-time (<1 sec) | High (requires hardware adapter) | ⚠️ Hardware dependency |

### 2.3 Recommended Approach: Connect IQ Watch App

> ✅ **Recommended:** Write a small Connect IQ DataField or Background app (in Garmin's Monkey C language) that reads live heart rate from the sensor API and HTTP POSTs it to your local server every 5 seconds. This is the standard community approach for this exact use case, with many examples and working implementations.

How it works:

- A small Monkey C app is installed on the Garmin watch via Garmin Express / Connect IQ Store (sideloaded for personal use).
- During a workout, the watch app reads `Activity.Info.currentHeartRate` on each `compute()` tick (fired every ~1 second).
- It uses `Communications.makeWebRequest()` to HTTP POST a JSON payload — e.g. `{ "hr": 145, "ts": 1234567890 }` — to your local server endpoint, e.g. `https://your-ngrok-url/api/bpm`.
- The request includes an `X-BPM-Key` header containing a shared secret for authentication (see §4.4).
- HTTPS is required on Android; for local development use ngrok (free tier) to expose the server.
- The server receives the BPM, validates the API key, evaluates threshold rules, and triggers Spotify if needed.

Activity detection (FR-11) is also handled inside the CIQ app — `makeWebRequest` calls only fire when the activity timer is running, and a final `"session_end"` event is sent when the activity stops.

> **Note:** Writing a Connect IQ app in Monkey C is new territory if you haven't done it before, but the language is simple (Java-like syntax) and there are comprehensive examples of the exact `makeWebRequest` + heart rate pattern in the Garmin developer forums. Expect 2–4 hours to write and sideload a working v1.

> **Note:** Claude Code cannot compile Monkey C. The Connect IQ SDK has its own standalone compiler and simulator. Claude Code can write the `.mc` source files, but compilation, simulation, and sideloading must be done manually outside of the Claude Code workflow. See §8 risk table for details.

---

## 3. Tech Stack Analysis & Recommendations

### 3.1 Stack Verdict Summary

| Layer | BRD Proposal | Recommendation | Verdict |
|---|---|---|---|
| Framework | Next.js App Router | Express.js (Node) | ⚠️ Change recommended |
| Language | TypeScript | TypeScript | ✅ Keep |
| UI | React | React (simple SPA) | ✅ Keep with caveat |
| Styling | Tailwind CSS | Tailwind CSS | ✅ Keep |
| ORM | Prisma ORM | Prisma ORM | ✅ Keep |
| Database | SQLite | SQLite | ✅ Keep |
| Garmin integration | Garmin Health API (OAuth) | Connect IQ watch app + local HTTP | ❌ Must change |
| Real-time BPM | Polling from cloud API | Server receives HTTP POSTs from watch | ❌ Must change |
| Spotify | Spotify Web API + /me/player/play | Spotify Web API + /me/player/play | ✅ Keep |
| Hosting | localhost | localhost | ✅ Keep |

### 3.2 Why Not Next.js?

The BRD proposes Next.js App Router, which is an excellent framework for many use cases. However, for this project it introduces unnecessary complexity for one key reason: the real-time BPM receiver.

The Connect IQ watch app will be sending HTTP POST requests to your server continuously during workouts. In Next.js App Router, Route Handlers are serverless functions — they are stateless by design and do not hold in-memory state between requests. This creates a problem:

- The "currently active BPM" and "currently active threshold rule" cannot be stored in a Route Handler's memory. You would need an external store (Redis, a DB write on every tick) just to share state between the BPM receiver and the Spotify trigger.
- The polling loop described in the BRD (`setInterval` evaluating thresholds) has no natural home in a stateless serverless architecture.
- SSE (Server-Sent Events) for the live dashboard (FR-18) requires a persistent HTTP connection, which Next.js Route Handlers do not support reliably in local development.

> 💡 **Alternative:** A plain Express.js server has none of these constraints. State lives in Node.js process memory (a simple JS object). SSE works natively. There is no build step required to run the server. For a single-user hobby app running on localhost, this is the pragmatic choice.

If you want to keep Next.js for the React UI (understandable, given ecosystem familiarity), a clean hybrid works well: Next.js serves the frontend only, and a separate Express server handles all API logic, the BPM receiver, and Spotify triggering. The two can run side by side in development.

### 3.3 Prisma + SQLite

The BRD's use of Prisma with SQLite is correct and appropriate for this project. It stores only one thing persistently: the BPM threshold rules (FR-04 through FR-10). Prisma's abstraction makes the future Supabase migration path legitimate. One caveat:

- Prisma does not support SQLite natively in edge/serverless environments, which reinforces the Express recommendation over Next.js serverless routes.
- SQLite is a local file and will not be accessible to the Connect IQ watch app — this is fine, because the watch app needs no direct DB access. Only the server reads rules from SQLite.

### 3.4 Spotify Integration

The BRD is correct here. Use the Spotify Web API for search and the `/me/player/play` endpoint for playback control. Key notes:

- Spotify requires an active Spotify Connect device. If the user's phone or desktop is running Spotify, `/me/player/play` will control it. This is the simplest path.
- The Spotify Web Playback SDK creates a new in-browser audio player — this requires Spotify Premium, adds complexity, and means audio plays through the browser, not the user's usual device. Avoid it unless specifically needed.
- For OAuth, use the **standard Authorization Code flow with client secret** (server-side confidential client). The Express server can securely store the `client_secret` — there is no reason to use PKCE, which is designed for public clients that cannot protect a secret. Store the access token and refresh token in the local SQLite DB via Prisma.
- Spotify access tokens expire after 1 hour. Implement automatic token refresh using the refresh token before every Spotify API call.
- **Rate limits:** Spotify returns HTTP 429 with a `Retry-After` header when rate-limited. The Spotify client wrapper must handle this gracefully (wait and retry). The threshold engine's 15-second cooldown (see §4.5) also helps prevent excessive API calls.

---

## 4. Revised Architecture

### 4.1 System Overview

The revised architecture has three components, all running on the same machine:

| Component | Technology | Role |
|---|---|---|
| Web Server | Node.js + Express | BPM receiver, Spotify triggering, rule management API, SSE for dashboard |
| Frontend UI | React + Tailwind (served by Express or Vite dev server) | Dashboard, rule config, OAuth callbacks |
| Database | SQLite via Prisma | Stores BPM rules, Spotify OAuth tokens |
| Garmin Layer | Connect IQ watch app (Monkey C) | Reads live HR, POSTs to local server every 5 sec |

### 4.2 Data Flow

| Step | Flow | Details |
|---|---|---|
| 1 | User starts workout on Garmin watch | CIQ app detects activity timer start |
| 2 | Watch POSTs BPM every 5 sec | `POST /api/bpm { hr: 148, active: true }` with `X-BPM-Key` header |
| 3 | Server validates API key | Reject with 401 if `X-BPM-Key` doesn't match `BPM_API_KEY` env var |
| 4 | Server receives BPM | In-memory state updated: `currentBpm = 148` |
| 5 | Cooldown check | If < 15 seconds since last Spotify switch, skip rule evaluation |
| 6 | Threshold evaluation | Find highest rule where `rule.bpm <= 148`; compare to `activeRuleId` |
| 7 | If rule changed: trigger Spotify | `PUT https://api.spotify.com/v1/me/player/play` with `context_uri` |
| 8 | Server pushes update to browser | SSE event sent to open dashboard tab (if any) |
| 9 | Workout ends | Watch POSTs `{ active: false }`; server optionally pauses Spotify |

### 4.3 HTTPS Requirement for Connect IQ

> ⚠️ **Important:** Garmin Connect on Android requires HTTPS for `makeWebRequest` calls (enforced since Garmin Connect Mobile 4.20). For a local hobby setup, the simplest solution is to use ngrok (free tier) to expose your local Express server over a public HTTPS URL. The watch POSTs to the ngrok URL, which tunnels to localhost. Alternatively, you can set up a self-signed certificate with a local trusted CA if you prefer to stay fully local.

### 4.4 BPM Endpoint Authentication

The `/api/bpm` endpoint is exposed to the public internet via ngrok. Without authentication, anyone with the ngrok URL could send fake BPM data and control Spotify playback.

**Implementation:**

- Generate a random secret (e.g. `openssl rand -hex 32`) and store it as `BPM_API_KEY` in `.env`.
- The Connect IQ watch app sends this secret in every request as the `X-BPM-Key` header.
- The Express `/api/bpm` handler validates the header on every request. Reject with HTTP 401 if missing or incorrect.
- The secret is hardcoded as a constant in the CIQ app source. When the secret changes, rebuild and re-sideload the CIQ app.

### 4.5 Threshold Switch Cooldown

To prevent rapid Spotify switching during BPM oscillation (e.g. interval training near a threshold boundary):

- The in-memory state tracks `lastSwitchAt` (timestamp of the last Spotify playback change).
- If a new rule match is detected but fewer than 15 seconds have elapsed since `lastSwitchAt`, the switch is deferred.
- The next BPM POST after the cooldown expires will re-evaluate and switch if still warranted.
- This also mitigates Spotify 429 rate-limit errors.

### 4.6 Below-All-Thresholds Behaviour

When BPM is below all configured thresholds (e.g. warm-up at 95 BPM, lowest rule is ≥ 110):

- No rule matches → `activeRuleId` becomes `null`.
- If Spotify is currently playing, **let it continue** — do not pause or stop.
- The system only actively calls Spotify when switching to a *new* matched rule.
- This ensures music keeps playing during warm-up and cool-down without interruption.

### 4.7 Server Restart Mid-Workout

In-memory state (`currentBpm`, `activeRuleId`, `sessionActive`, `lastSwitchAt`) is lost if the Express server restarts during a workout (crash, nodemon reload, etc.). Known behaviours:

- The watch continues POSTing regardless — it has no knowledge of server state.
- The next BPM POST will re-establish `sessionActive = true` and trigger the appropriate rule.
- This may cause a momentary Spotify re-trigger for the current threshold band even if that music was already playing.
- This is a known v1 limitation. Document in README.

---

## 5. Recommended Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Server framework | Express.js (Node.js) | Stateful, supports SSE, simple to run locally |
| Language | TypeScript | As proposed in BRD |
| Frontend | React + Vite | Vite for fast dev server; simpler than Next.js for a single-page dashboard |
| Styling | Tailwind CSS | As proposed in BRD |
| ORM | Prisma ORM | As proposed in BRD |
| Database | SQLite | As proposed in BRD |
| Garmin layer | Connect IQ app (Monkey C) | Replaces Garmin Health API entirely |
| Spotify | Spotify Web API | Standard Auth Code flow with client secret; `/me/player/play` endpoint |
| Local HTTPS | ngrok (free) or mkcert | Required for CIQ `makeWebRequest` on Android |
| Source control | GitHub | As proposed in BRD |
| Dev tooling | ESLint, ts-node, nodemon | Standard Node.js dev stack |

---

## 6. Implementation Plan

Recommended implementation sequence, phased to ensure each piece is testable before building on top of it.

### Phase 1 — Core Server + Spotify OAuth (Day 1)

- Initialise Node.js + TypeScript + Express project with Prisma + SQLite.
- Implement Prisma schema: `BpmRule` (id, bpm, spotifyUri, spotifyType, label), `OAuthToken` (service, accessToken, refreshToken, expiresAt).
- Build Spotify OAuth 2.0 standard Authorization Code flow (with client secret): `/auth/spotify/login` → `/auth/spotify/callback`. Store tokens in DB.
- Build `/api/rules` CRUD endpoints (GET, POST, PUT, DELETE).
- Implement Spotify search proxy endpoint: `GET /api/spotify/search?q=...` (calls Spotify API server-side to avoid CORS).
- **Test:** can configure rules, can search Spotify, tokens stored and refreshed correctly.

### Phase 2 — BPM Receiver + Threshold Engine (Day 1–2)

- Build `POST /api/bpm` endpoint. Accepts `{ hr: number, active: boolean }`. Validates `X-BPM-Key` header against `BPM_API_KEY` env var.
- In-memory state module: `currentBpm`, `activeRuleId`, `sessionActive`, `lastSwitchAt`, `lastBpmReceivedAt`.
- Threshold evaluation logic: find highest rule where `rule.bpm <= currentBpm`; if different from `activeRuleId` and cooldown (15s) has elapsed, call Spotify `/me/player/play`.
- Below-all-thresholds: if no rule matches, set `activeRuleId = null` but do not pause Spotify.
- Implement session end handler: when `active: false`, optionally pause Spotify, clear `activeRuleId`.
- Spotify client wrapper: handle 429 responses with `Retry-After` header.
- **Test with curl:** `curl -X POST http://localhost:3001/api/bpm -H "X-BPM-Key: your-secret" -H "Content-Type: application/json" -d '{"hr":145,"active":true}'` — verify Spotify switches track.

### Phase 3 — Connect IQ Watch App (Day 2)

- Install Connect IQ SDK and VS Code extension.
- Write a minimal DataField or Background app in Monkey C that reads `Activity.Info.currentHeartRate` and POSTs to your server URL every 5 seconds, including the `X-BPM-Key` header.
- Handle the HTTPS requirement: set up ngrok, update the URL constant in the CIQ app.
- Sideload onto Garmin watch via Garmin Express or Garmin Connect app.
- **Note:** Claude Code can write the `.mc` source files but cannot compile them. Compilation and sideloading must be done manually using the Connect IQ SDK.
- **Test:** go for a run, verify BPM values arrive at the server and Spotify switches.

### Phase 4 — React Dashboard (Day 2–3)

- Build React + Vite frontend. Single-page app with two views: Rule Config and Live Dashboard.
- Rule Config: list of rules ordered by BPM (lowest to highest), add/edit/delete. Spotify search modal when linking content.
- Live Dashboard: connects to `GET /api/stream` (SSE endpoint) showing live BPM, active rule, now playing track, connection status for Spotify and watch data freshness.
- Build SSE endpoint on Express: `GET /api/stream`. Server pushes state updates whenever BPM is received or rule changes.
- **Clarify in UI:** The dashboard is observational only. The BPM → Spotify pipeline works without the dashboard open.

### Phase 5 — Polish + Error Handling (Day 3)

- Handle Spotify token expiry: auto-refresh before any Spotify API call.
- Handle Spotify 429: respect `Retry-After` header, log warning.
- Handle BPM receiver errors: if no BPM received for >30 seconds during a session, show warning in dashboard.
- Handle `makeWebRequest` errors from CIQ app: implement exponential backoff (1s, 2s, 4s, max 3 retries).
- Add `.env.example` with all required env vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `DATABASE_URL`, `NGROK_URL`, `BPM_API_KEY`.
- Write README covering local setup, CIQ app compilation (manual), ngrok setup steps, and known limitations (server restart behaviour).

---

## 7. Suggested Project Structure

| Path | Contents |
|---|---|
| `/server` | Express app, route handlers, threshold engine, Spotify client, SSE broadcaster |
| `/server/prisma` | `schema.prisma`, `migrations/` |
| `/client` | React + Vite frontend (Rule Config + Live Dashboard) |
| `/garmin` | Connect IQ watch app source (Monkey C `.mc` files). Must be compiled manually with CIQ SDK. |
| `/.env.example` | All required environment variable placeholders |
| `/README.md` | Local setup, ngrok instructions, CIQ compilation + sideload guide, known limitations |

---

## 8. Remaining Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Connect IQ HTTPS requirement blocks local testing | Medium | High | Use ngrok free tier for HTTPS tunnel. Add to README as a required setup step. |
| `makeWebRequest` connection drops during long workouts (-2 BLE error) | Medium | Medium | Implement backoff in CIQ app as per Garmin forum examples. Dashboard shows stale-data warning after 30s without update. |
| Spotify playback triggers on wrong device (not phone/headphones) | Low | Medium | Add Spotify device selector in settings UI (call `/me/player/devices` to list and let user pin target device). |
| CIQ app memory limits on older Garmin models | Low | Low | Test on target device model. The app is minimal (HR sensor + HTTP POST) and should fit well within memory on any modern Garmin watch. |
| ngrok URL changes on free tier restart | High | Low | Accept as a hobby tradeoff. Update CIQ app URL constant and re-sideload. Or use ngrok stable URL (paid) or mkcert for fully local HTTPS. |
| Claude Code cannot compile Monkey C | Certain | Medium | Claude Code can write `.mc` source files but compilation requires the standalone CIQ SDK. Mark all Garmin Linear issues as requiring manual compile/test step. |
| Spotify 429 rate-limiting during rapid BPM changes | Medium | Medium | 15-second cooldown between switches (FR-23). Spotify client respects `Retry-After` header. |
| Server restart mid-workout loses in-memory state | Low | Low | Known v1 limitation. Watch continues POSTing; server re-establishes session on next POST. Document in README. |
| BPM endpoint exposed via ngrok without auth | High (if unmitigated) | High | Shared secret in `X-BPM-Key` header, validated on every request (FR-21). |

---

## 9. Confirmations: Out of Scope Items

| Item | Status | Note |
|---|---|---|
| Multi-user / sharing | Out of scope | No impact. Single-user assumptions baked into DB schema and auth. |
| Garmin OAuth 2.0 (original FR-02) | Replaced | OAuth not needed. CIQ app has no cloud auth. Replaced by direct HTTP POST from watch with shared-secret authentication. |
| Post-workout analytics | Out of scope | Current schema stores no historical BPM data. Can be added in vnext. |
| Mobile native app | Out of scope | Browser dashboard is sufficient and optional during workouts. |
| Cadence triggers | Out of scope | CIQ app only reads `heartRate` from `ActivityInfo`. Cadence can be added later. |

---

## 10. Summary

The proposed BRD is well-structured and the scope is appropriate for a hobby project. One critical change is required — the Garmin integration approach — and one stack simplification is recommended.

| Decision | Original BRD | Recommendation |
|---|---|---|
| Garmin live BPM source | Garmin Health API (cloud, post-sync) | Connect IQ watch app POSTing to local server |
| Server framework | Next.js App Router | Express.js (Node.js) |
| Frontend | React via Next.js | React via Vite (served separately) |
| Garmin OAuth | Required (OAuth 2.0) | Not needed — replaced by CIQ direct HTTP + shared secret |
| Spotify OAuth | PKCE (public client) | Standard Authorization Code with client secret (confidential server) |
| BPM endpoint auth | Not mentioned | Shared secret via `X-BPM-Key` header |
| In-memory state | Stored in DB / external store | Node.js process memory (simple object) |
| SSE for dashboard | Needs workaround in Next.js | Native in Express |
| Threshold cooldown | Not mentioned | 15-second minimum between Spotify switches |
| Below-all-thresholds | Not specified | Continue playing current music, don't pause |
| Database | SQLite + Prisma | SQLite + Prisma (unchanged) |
| HTTPS for local dev | Not mentioned | Required for Android CIQ — use ngrok |

> 💡 **Estimated build time:** For a developer comfortable with Node.js and TypeScript, the full v1 is achievable in 2–3 focused days. The Connect IQ watch app (Monkey C) is the least-familiar part and may add 3–5 hours if it's the first time using the CIQ SDK. CIQ compilation and sideloading must be done manually — Claude Code cannot build Monkey C.

*This plan is ready to be handed to an AI coding assistant (such as Claude Code) as the implementation brief.*
