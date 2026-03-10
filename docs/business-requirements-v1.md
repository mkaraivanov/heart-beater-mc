# Business Requirements — BPM-Triggered Spotify Playlist Switcher
**Version:** 1.1  
**Date:** 2026-03-09  
**Status:** Draft  

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-03-08 | Initial draft |
| 1.1 | 2026-03-09 | Replaced Garmin Health API with Connect IQ watch app per Technical Plan findings. Removed FR-02 (Garmin OAuth). Updated FR-03, FR-11, FR-12 to reflect CIQ architecture. Added FR-21 (BPM endpoint authentication). Added FR-22 (below-all-thresholds behaviour). Added FR-23 (threshold switch cooldown). Updated tech stack to Express + Vite. Clarified Spotify OAuth as standard Authorization Code flow (not PKCE). |

---

## 1. Overview

A personal web application that automatically switches Spotify playback in real-time during exercise, based on live heart rate BPM data pushed from a Garmin wearable device. The user configures BPM thresholds in advance, each mapped to a specific Spotify song or playlist. When the user's heart rate crosses a threshold during a workout, the app triggers Spotify to play the corresponding music automatically.

The Garmin watch runs a small Connect IQ app (written in Monkey C) that reads live heart rate and HTTP POSTs it to the local server every 5 seconds. This replaces the originally proposed Garmin Health API, which cannot deliver real-time BPM data (see Technical Implementation Plan §2 for full analysis).

---

## 2. Goals

- Allow the user to pre-configure BPM threshold rules that map heart rate ranges to Spotify songs or playlists.
- During an active Garmin workout, receive live heart rate BPM in real-time from the Connect IQ watch app.
- Automatically switch Spotify playback when the user's heart rate crosses a configured threshold.
- Provide a clean, simple web UI for managing configurations.

---

## 3. Users

| User | Description |
|---|---|
| Primary User | Single user (app owner). No multi-user or sharing functionality required in v1. |

---

## 4. Functional Requirements

### 4.1 Authentication & Integrations

| ID | Requirement |
|---|---|
| FR-01 | The app shall support OAuth 2.0 login with **Spotify** (standard Authorization Code flow with client secret, server-side) to authorise playback control on the user's account. |
| FR-02 | ~~Removed in v1.1.~~ Garmin OAuth is not required. The Connect IQ watch app communicates directly with the server via authenticated HTTP POST — no cloud OAuth is involved. |
| FR-03 | The app shall securely store and refresh **Spotify** OAuth tokens (access token + refresh token). Tokens shall be stored in the local database and never exposed client-side. |

---

### 4.2 BPM Threshold Configuration

| ID | Requirement |
|---|---|
| FR-04 | The user shall be able to create a **BPM threshold rule**, consisting of: a minimum BPM value, and a linked Spotify song or playlist. |
| FR-05 | The user shall be able to create multiple rules, each with a different BPM threshold. |
| FR-06 | The user shall be able to **edit** an existing rule (change BPM value or linked Spotify content). |
| FR-07 | The user shall be able to **delete** an existing rule. |
| FR-08 | The user shall be able to **search or browse their Spotify library** (playlists and saved songs) when linking content to a rule. |
| FR-09 | Rules shall be displayed in a list, ordered by BPM threshold (lowest to highest). |
| FR-10 | The system shall prevent duplicate BPM threshold values (two rules cannot share the same BPM trigger). |

**Example configuration:**

| BPM Threshold | Spotify Content |
|---|---|
| ≥ 110 BPM | Playlist: "Warm Up Vibes" |
| ≥ 120 BPM | Playlist: "Rap Fuel" |
| ≥ 130 BPM | Playlist: "Rock Hard" |
| ≥ 150 BPM | Song: "Lose Yourself — Eminem" |

---

### 4.3 Real-Time Workout Monitoring

| ID | Requirement |
|---|---|
| FR-11 | The app shall detect when the user **starts an activity** by receiving the first BPM POST from the Connect IQ watch app (which only sends data when the activity timer is running). |
| FR-12 | During an active Garmin session, the Connect IQ watch app shall **push live heart rate BPM** to the server via HTTP POST at a regular interval (target: every 5 seconds). |
| FR-13 | When the user's live BPM meets or exceeds a configured threshold, the app shall **trigger Spotify playback** of the linked song or playlist. |
| FR-14 | The app shall apply the rule with the **highest matching threshold** — e.g. if BPM is 135 and rules exist at 120 and 130, the 130 rule fires. |
| FR-15 | The app shall **not re-trigger** the same rule if the BPM remains within the same threshold band (avoid repeated interruptions). |
| FR-16 | If the user's BPM **drops below** a threshold, the system shall switch back to the rule for the lower band (if one is configured). |
| FR-17 | When the Garmin activity ends (watch sends `{ active: false }`), the app shall **stop monitoring** and optionally pause Spotify playback. |

---

### 4.4 Below-All-Thresholds Behaviour

| ID | Requirement |
|---|---|
| FR-22 | When the user's BPM is **below all configured thresholds** (e.g. BPM is 95 and the lowest rule is ≥ 110), no rule matches. In this case: if music is already playing (e.g. from a previous threshold), **let it continue playing** — do not pause or stop Spotify. If no music is playing, do nothing. The system only actively switches playback when a threshold boundary is crossed, not when no rule matches. |

> **Rationale:** This covers warm-up and cool-down periods. Pausing music during warm-up would be a poor user experience. The user can always manually control Spotify when no rule is active.

---

### 4.5 Threshold Switch Cooldown

| ID | Requirement |
|---|---|
| FR-23 | The app shall enforce a **minimum cooldown of 15 seconds** between Spotify playback switches. If the user's BPM oscillates rapidly around a threshold boundary (e.g. during interval training), the system shall not fire a new rule change until the cooldown has elapsed. The most recent BPM reading at the time the cooldown expires shall determine the active rule. |

> **Rationale:** Prevents rapid-fire Spotify API calls and a jarring user experience when BPM fluctuates near a threshold. Also mitigates Spotify 429 (rate limit) errors.

---

### 4.6 BPM Endpoint Authentication

| ID | Requirement |
|---|---|
| FR-21 | The `POST /api/bpm` endpoint shall require a **shared secret** (API key) passed as a header (e.g. `X-BPM-Key`). The same secret shall be hardcoded in the Connect IQ watch app and stored in the server's `.env` file as `BPM_API_KEY`. Requests without a valid key shall be rejected with HTTP 401. |

> **Rationale:** The BPM endpoint is exposed to the public internet via ngrok. Without authentication, anyone with the ngrok URL could send fake BPM data and control Spotify playback.

---

### 4.7 Dashboard / Status View

| ID | Requirement |
|---|---|
| FR-18 | The app shall display a **live status panel** during an active session, showing: current heart rate BPM, currently active threshold rule, and currently playing Spotify track/playlist. |
| FR-19 | The app shall indicate clearly when **no active Garmin session** is detected. |
| FR-20 | The app shall indicate clearly when **Spotify is not connected** and prompt the user to authenticate. |

> **Note:** The dashboard is purely observational. The core BPM → threshold → Spotify pipeline runs entirely server-side and does **not** require the dashboard to be open in a browser. The system works even if no browser tab is open.

---

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Latency:** Spotify playback switch should occur within 10 seconds of a BPM threshold being crossed (subject to the 15-second cooldown in FR-23). |
| NFR-02 | **Security:** Spotify OAuth tokens must be stored securely (never exposed client-side). The BPM endpoint must be authenticated (FR-21). |
| NFR-03 | **Reliability:** The app should handle Garmin or Spotify API errors gracefully, with user-facing error messages. Spotify 429 rate-limit responses shall be handled with retry-after logic. |
| NFR-04 | **Single user:** No user accounts or multi-user authentication required for v1. App runs locally for personal use only. |
| NFR-05 | **Browser-based:** The application runs as a lightweight local web server accessible via browser. The dashboard is optional during workouts — the server operates independently. |

---

## 6. Out of Scope (v1)

- Multi-user support or friend sharing
- Social / community features
- Post-workout music history or analytics
- Cadence (steps per minute) as a trigger — heart rate BPM only
- Mobile native app
- Offline mode
- Garmin Health API / Garmin OAuth (replaced by Connect IQ direct HTTP)

---

## 7. Key Technical Considerations for Claude Code

- **Spotify API:** Use the [Spotify Web API](https://developer.spotify.com/documentation/web-api) for playlist/track search and the `/me/player/play` endpoint for playback control. Do **not** use the Spotify Web Playback SDK (it creates an in-browser player, adds complexity, and forces audio through the browser).
- **Garmin Layer:** A small Connect IQ watch app (Monkey C) reads live heart rate and HTTP POSTs to the local Express server. No Garmin cloud API or OAuth is involved. See Technical Implementation Plan §2.3 for details.
- **HTTPS for Connect IQ:** The watch app requires HTTPS (enforced by Garmin Connect Mobile on Android). Use ngrok (free tier) to expose the local server. The ngrok URL is stored in `.env` as `NGROK_URL`.
- **Threshold engine:** Server-side in-memory state tracks `currentBpm`, `activeRuleId`, `sessionActive`, and `lastSwitchAt` (for cooldown). Evaluates rules on each BPM POST — no polling loop needed.
- **Config persistence:** Store BPM threshold rules and Spotify OAuth tokens in **SQLite** (via Prisma ORM) for v1. Prisma acts as the abstraction layer — switching to Supabase (PostgreSQL) in a future version requires only a connection string change and a migration, with no application code changes.
- **Server restart resilience:** In-memory state is lost on server restart. This is a known v1 limitation. If the server restarts mid-workout, the next BPM POST will re-establish the session and trigger the appropriate rule. Document this in the README.

---

## 8. Tech Stack

| Layer | v1 | vnext |
|---|---|---|
| Server | Node.js + Express + TypeScript | ← same (or migrate to Vercel) |
| Frontend | React + Vite + Tailwind CSS | ← same |
| Language | TypeScript | ← same |
| Linting | ESLint | ← same |
| Styling | Tailwind CSS | ← same |
| ORM | Prisma ORM | ← same |
| Database | SQLite (local file) | Supabase (PostgreSQL) |
| Garmin | Connect IQ watch app (Monkey C) | ← same |
| Hosting | localhost (+ ngrok for CIQ HTTPS) | Vercel + persistent DB |
| Source Control | GitHub | ← same |

### Notes for Claude Code

- Use **Express.js** with TypeScript for the server — not Next.js. Express supports in-memory state, SSE, and long-lived connections natively. See Technical Implementation Plan §3.2 for rationale.
- Use **React + Vite** for the frontend SPA, served separately from the Express server.
- **Prisma** should be configured with **SQLite** for v1 using a local `.db` file. The Prisma schema must be written to be **database-agnostic** — no SQLite-specific types or constraints — so that switching to Supabase PostgreSQL in vnext requires only updating the `DATABASE_URL` in `.env` and re-running migrations.
- **Spotify OAuth** uses the standard **Authorization Code flow with client secret** (server-side confidential client). Do not use PKCE — the server can securely store the client secret. Store `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`.
- Environment variables should be documented in a `.env.example` file, with placeholders already anticipating future Supabase and Vercel values.
- The repository should be structured for **GitHub hosting**, with a `.gitignore` appropriate for Node.js (including the SQLite `.db` file) and a `README.md` covering local setup, environment variables, ngrok configuration, and Connect IQ sideloading steps.

### Database Migration Path (v1 → vnext)

The use of Prisma ORM ensures the database layer is fully abstracted. To migrate from SQLite to Supabase PostgreSQL, the following steps should suffice with no application code changes:
1. Update `DATABASE_URL` in `.env` to the Supabase connection string.
2. Update `provider` in `prisma/schema.prisma` from `sqlite` to `postgresql`.
3. Run `prisma migrate deploy` against the new database.

---

*This document represents v1 scope only. Future versions may include social features, cadence-based triggers, and post-workout analytics.*
