# Heart Beater MC — Project Memory

## What this app does
BPM-triggered Spotify playlist switcher. A Garmin Connect IQ watch app POSTs
live heart rate to a local Express server every 5 s. The server evaluates
BPM threshold rules stored in SQLite and calls Spotify /me/player/play when
the user's heart rate crosses a rule boundary.

## Authoritative documents
- Business Requirements: /docs/business-requirements-v1.md
- Technical Implementation Plan: /docs/technical-plan-v1.md
- Claude Code Assets (this architecture): /docs/claude-code-assets.md
Where the BRD and Technical Plan disagree, the Technical Plan takes precedence
(it supersedes the original BRD on Garmin approach, stack choice, and OAuth flow).

## Stack
- Server: Node.js + Express + TypeScript (port 3001)
- Client: React + Vite + Tailwind CSS (port 5173)
- ORM: Prisma with SQLite (`server/prisma/dev.db`)
- Garmin: Connect IQ app in Monkey C (`/garmin/`) — compiled manually, NOT by Claude Code
- Spotify: Web API, standard Authorization Code flow with client secret (NOT PKCE)
- Local HTTPS: ngrok (required for Android CIQ `makeWebRequest`)

## Monorepo layout
/server   → Express API, threshold engine, SSE broadcaster, Prisma
/client   → React SPA (Rule Config + Live Dashboard views)
/garmin   → Connect IQ watch app source (.mc files) — requires manual CIQ SDK build

## Key conventions
- All API routes: /server/src/routes/
- In-memory state (currentBpm, activeRuleId, sessionActive, lastSwitchAt): /server/src/state.ts
- Prisma schema: /server/prisma/schema.prisma
- Environment variables: documented in /.env.example
- TypeScript strict mode on in both /server and /client

## Dev commands
npm run dev:server   → nodemon server on :3001
npm run dev:client   → vite on :5173
npm run typecheck    → tsc --noEmit across workspaces
npm run test         → vitest

## Critical architectural constraints
1. DO NOT use Next.js — server is plain Express (stateful SSE + in-memory BPM state)
2. DO NOT write SQLite-specific types in Prisma schema (must be portable to PostgreSQL)
3. Spotify token refresh must happen before EVERY Spotify API call
4. Spotify OAuth is standard Authorization Code flow with client_secret — NOT PKCE
5. ngrok URL is stored in .env as NGROK_URL — the CIQ app reads it as a constant
6. The threshold engine picks the HIGHEST matching rule (rule.bpm <= currentBpm)
7. POST /api/bpm requires X-BPM-Key header matching BPM_API_KEY env var — reject 401 otherwise
8. 15-second cooldown between Spotify switches (lastSwitchAt in state.ts)
9. Below all thresholds = continue playing current music, do NOT pause Spotify
10. The dashboard is optional — the BPM→Spotify pipeline works without any browser tab open
11. Claude Code CANNOT compile Monkey C — all /garmin/ changes require manual build + sideload

## Security & .gitignore

Never commit sensitive information to git. The following are ALWAYS gitignored
and must NEVER be added to version control under any circumstances:

### Secrets & credentials
- `.env` — contains SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, BPM_API_KEY, DATABASE_URL
- `.env.local`, `.env.*.local` — any local environment overrides
- Any file containing a raw API key, client secret, or access/refresh token

### Database
- `server/prisma/*.db` — SQLite database files (contain user data and OAuth tokens)
- `server/prisma/*.db-journal` — SQLite write-ahead log files

### Generated / build output
- `node_modules/` — all dependency directories
- `dist/`, `build/` — compiled output
- `server/dist/`, `client/dist/`

### IDE & OS
- `.DS_Store`, `Thumbs.db`
- `.vscode/`, `.idea/` (optional — developer preference)

### Claude Code convention
- `.env.example` IS committed — it documents required variables with placeholder
  values only (no real secrets). Always keep `.env.example` up to date when
  adding new environment variables.
- If you ever need to reference a secret value in code, read it from
  `process.env.<VAR_NAME>` only. Never hardcode or interpolate secrets into
  source files, log statements, or comments.

## Linear integration
Work items are tracked in Linear. Use the `linear-implementer` sub-agent or
the `/implement` command to pick up and complete issues end-to-end.
MCP server: https://mcp.linear.app/sse (configured in .claude/mcp.json)

## Out of scope (v1)
Multi-user, analytics, cadence triggers, mobile native app, offline mode.
