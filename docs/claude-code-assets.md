# Heart Beater MC — Claude Code Assets Recommendation

**Version:** 1.1 | **Date:** March 2026  
**Purpose:** Define the Claude Code infrastructure (CLAUDE.md, sub-agents, slash commands, hooks, MCP) to enable Claude Code to navigate this project flawlessly with minimal context usage.

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-03-08 | Initial draft |
| 1.1 | 2026-03-09 | Fixed Spotify OAuth references (standard Auth Code, not PKCE). Added BPM endpoint auth (`X-BPM-Key`) to all relevant CLAUDE.md files and sub-agents. Added `lastSwitchAt` cooldown and below-all-thresholds behaviour to threshold engine. Consolidated 5 sub-agents down to 3 (linear-implementer, db-migrator, spotify-specialist; folded garmin and threshold knowledge into layer CLAUDE.md files). Replaced `/new-rule` command with `/extend-schema` command. Fixed post-edit hook `$FILE` variable issue. Added CIQ manual-compile caveat to garmin CLAUDE.md. Clarified dashboard is optional during workouts. |

---

## Design Philosophy

Three principles drive every recommendation below:

1. **Context is precious.** Load detail only when needed (skills > CLAUDE.md for niche knowledge). Keep CLAUDE.md to orientation facts Claude always needs, not encyclopaedic reference.
2. **Specialise through sub-agents — but don't over-specialise.** Isolate genuinely complex or high-risk tasks in sub-agents. Fold small domain knowledge into layer-level CLAUDE.md files instead of creating separate agents for every concern.
3. **Determinism through hooks.** Anything that must *always* happen (type-check, lint, Linear sync) lives in a hook — not in a prompt that might be ignored.

---

## Project File Structure

```
heart-beater-mc/
├── CLAUDE.md                          ← Root project memory (always loaded)
├── .claude/
│   ├── agents/
│   │   ├── linear-implementer.md      ← Picks up Linear issue, implements, closes it
│   │   ├── spotify-specialist.md      ← Spotify OAuth + API expert
│   │   └── db-migrator.md             ← Prisma schema + migration safe-guard
│   ├── commands/
│   │   ├── implement.md               ← /implement <LINEAR-ID> — full issue → PR flow
│   │   ├── extend-schema.md           ← /extend-schema — safely modify Prisma schema
│   │   ├── check-types.md             ← /check-types — run tsc + ESLint, show summary
│   │   └── sync-linear.md             ← /sync-linear — pull open issues into a local todo
│   └── hooks/
│       ├── pre-commit.sh              ← Block commit if tsc or tests fail
│       └── post-edit-typecheck.sh     ← Run tsc silently after each file edit; surface errors
├── server/
│   ├── CLAUDE.md                      ← Server-layer sub-CLAUDE.md (Express, Prisma, SSE)
├── client/
│   ├── CLAUDE.md                      ← Client-layer sub-CLAUDE.md (React, Vite, Tailwind)
└── garmin/
    └── CLAUDE.md                      ← Garmin layer sub-CLAUDE.md (Monkey C, CIQ SDK)
```

---

## 1. Root `CLAUDE.md`

**Purpose:** Single source of truth loaded at every session. Orientation only — no deep API docs (those live in skills or sub-agents).

```markdown
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

## Linear integration
Work items are tracked in Linear. Use the `linear-implementer` sub-agent or
the `/implement` command to pick up and complete issues end-to-end.
MCP server: https://mcp.linear.app/sse (configured in .claude/mcp.json)

## Out of scope (v1)
Multi-user, analytics, cadence triggers, mobile native app, offline mode.
```

---

## 2. Sub-CLAUDE.md Files (Layer-Level Memory)

These are loaded only when Claude is working within that directory, keeping the root file lean.

### `/server/CLAUDE.md`
```markdown
# Server Layer

## Entry point
src/index.ts → Express app on port 3001

## Route handlers
GET  /api/rules          → list all BPM rules (ordered by bpm ASC)
POST /api/rules          → create rule
PUT  /api/rules/:id      → update rule
DELETE /api/rules/:id    → delete rule
GET  /api/spotify/search → proxy Spotify search (avoids browser CORS)
POST /api/bpm            → receives { hr: number, active: boolean } from watch
                           MUST validate X-BPM-Key header (see Auth below)
GET  /api/stream         → SSE endpoint for live dashboard updates
GET  /auth/spotify/login → initiates standard Authorization Code OAuth flow
GET  /auth/spotify/callback → exchanges code for tokens using client_secret, stores in DB

## BPM endpoint authentication
POST /api/bpm validates the X-BPM-Key header against process.env.BPM_API_KEY.
If missing or wrong → return 401 immediately. This is critical because the
endpoint is exposed to the public internet via ngrok.

## State module (src/state.ts)
Single exported object:
{
  currentBpm: number | null,
  activeRuleId: string | null,
  sessionActive: boolean,
  lastBpmReceivedAt: Date | null,
  lastSwitchAt: Date | null          ← tracks cooldown between Spotify switches
}
Mutated only by the /api/bpm handler. Read by SSE broadcaster.

## Threshold engine rules
- Find highest rule where rule.bpm <= currentBpm
- If different from activeRuleId AND >= 15 seconds since lastSwitchAt → switch Spotify
- If no rule matches (BPM below all thresholds) → set activeRuleId = null, do NOT pause Spotify
- On session end ({ active: false }) → optionally pause Spotify, clear state

## Prisma models
BpmRule: id, bpm (Int, unique), spotifyUri, spotifyType, label, createdAt
OAuthToken: id, service, accessToken, refreshToken, expiresAt

## Spotify integration
src/spotify/client.ts wraps all Spotify API calls.
- Always calls ensureFreshToken() before any request.
- Uses standard Authorization Code flow with client_secret (NOT PKCE).
- Handles 429 responses: read Retry-After header, wait, retry once.
- Playback: PUT /v1/me/player/play (requires active Spotify Connect device).
- Search: GET /v1/search (proxied to avoid browser CORS).

## SSE pattern
src/sse/broadcaster.ts maintains a Set of active Response objects.
Call broadcast(event, data) to push to all connected dashboard tabs.
Dashboard is purely observational — the pipeline works without it.

## Known limitation: server restart
In-memory state is lost on restart. The watch continues POSTing and the
next BPM POST re-establishes the session. May cause a momentary re-trigger.
```

### `/client/CLAUDE.md`
```markdown
# Client Layer

## Two views (React Router)
/           → Live Dashboard (SSE connection, shows BPM + active rule + now playing)
/rules      → Rule Config (CRUD list, Spotify search modal)

## SSE hook
src/hooks/useServerEvents.ts — connects to GET /api/stream, updates local state

## Important UX note
The dashboard is optional during workouts. The server-side BPM→Spotify pipeline
works without the dashboard open. Show this clearly in the UI — e.g.
"The music switching works even if you close this tab."

## API calls
All via src/api/client.ts — thin wrappers around fetch to :3001

## Tailwind only — no custom CSS files
```

### `/garmin/CLAUDE.md`
```markdown
# Garmin Connect IQ Layer

## ⚠️ MANUAL BUILD REQUIRED
Claude Code CANNOT compile Monkey C. The Connect IQ SDK is a standalone tool
with its own compiler and simulator. Claude Code can write and edit .mc source
files, but compilation, simulation, and sideloading must be done manually.

When working on this directory:
- Write/edit .mc files as needed
- Note in your summary that manual CIQ SDK build + sideload is required
- Do NOT attempt to run connectiq CLI commands in bash

## Language
Monkey C (Java-like). SDK docs: https://developer.garmin.com/connect-iq/

## App type
DataField (preferred for HR access during workouts)

## Key APIs
Activity.Info.currentHeartRate   → live BPM (read in compute() tick ~1/sec)
Communications.makeWebRequest()  → HTTP POST to NGROK_URL/api/bpm

## Payload shape
{ "hr": <int>, "active": <bool>, "ts": <epoch_ms> }

## Authentication
Every request MUST include the X-BPM-Key header with the shared secret.
The secret is defined as a constant at the top of the source file.
When BPM_API_KEY changes in .env, this constant must be updated and the
app recompiled + re-sideloaded.

## HTTPS requirement
Android Garmin Connect Mobile >= 4.20 enforces HTTPS.
The NGROK_URL constant at top of source must point to active ngrok tunnel.

## Session detection
Send { active: false } in onTimerStop() callback.
Do not POST when activity timer is not running.

## Known error: makeWebRequest -2
BLE connection drop. Implement exponential backoff: [1000, 2000, 4000] ms,
max 3 retries. Log failure to Toybox.System.println for simulator debugging.

## Backoff pattern
```monkey-c
var _retryDelays = [1000, 2000, 4000];
var _retryCount = 0;

function onResponse(responseCode, data) {
    if (responseCode == 200) {
        _retryCount = 0;
    } else if (_retryCount < _retryDelays.size()) {
        var timer = new Timer.Timer();
        timer.start(method(:retryPost), _retryDelays[_retryCount], false);
        _retryCount++;
    }
}
```
```

---

## 3. Sub-Agents (`.claude/agents/`)

> **Design decision (v1.1):** Reduced from 5 sub-agents to 3. The garmin-ciq-specialist and threshold-engine specialist were folded into their respective layer CLAUDE.md files — the domain knowledge in each was only a few paragraphs and didn't justify separate context isolation. Keeping agents lean reduces maintenance overhead as the codebase evolves.

### `linear-implementer.md` ⭐ (Primary workhorse)

```yaml
---
name: linear-implementer
description: >
  Implements a Linear work item end-to-end. Given a Linear issue ID (e.g. HB-12),
  fetches the issue details, writes all required code, runs typechecks, then
  marks the issue In Progress → In Review in Linear. Invoke when the user says
  "implement HB-XX" or "work on [Linear issue]".
tools: Read, Write, Edit, Bash, Glob, Grep
mcpServers:
  - name: linear
    url: https://mcp.linear.app/sse
model: sonnet
maxTurns: 40
---

You are the Heart Beater MC implementer. Your job is to complete Linear issues
autonomously from first read to final typecheck.

## Workflow
1. Fetch the Linear issue using the Linear MCP tool. Read title, description,
   and any linked sub-tasks.
2. Set the issue status to **In Progress** in Linear.
3. Read the relevant CLAUDE.md files (root + any layer-level ones in scope).
4. Implement the feature or fix. Follow all conventions in CLAUDE.md.
5. Run `npm run typecheck` — fix all errors before proceeding.
6. Run `npm run test` — fix any regressions.
7. Write a brief implementation summary (3–5 bullets).
8. Set the issue status to **In Review** in Linear and post the summary as a
   comment on the issue.

## Rules
- Never skip the typecheck step.
- Never modify the Prisma schema without also generating a migration
  (`npx prisma migrate dev --name <description>`).
- Never hardcode credentials — use environment variables from .env.
- Keep Spotify token refresh logic in src/spotify/client.ts only.
- Spotify OAuth is standard Authorization Code with client_secret — NOT PKCE.
- POST /api/bpm MUST validate X-BPM-Key header — never remove this check.
- If the issue touches /garmin/ files: write the .mc source, but note in
  your summary that manual CIQ SDK compilation and sideloading is required.
  Do NOT attempt to run CIQ build commands.
- If the issue is ambiguous, post a clarifying comment on the Linear issue
  and pause — do not guess.

## Memory
Update your memory as you discover new file locations, patterns, or
architectural decisions not yet documented in CLAUDE.md.
```

---

### `spotify-specialist.md`

```yaml
---
name: spotify-specialist
description: >
  Expert in Spotify Web API integration: standard Authorization Code flow
  with client secret, token refresh, /me/player/play endpoint, search API,
  device management, and rate-limit handling.
  Invoke for any task touching Spotify auth, playback control, or search.
tools: Read, Write, Edit, Bash, Grep
model: sonnet
---

You are the Spotify integration expert for Heart Beater MC.

## Scope
- Standard Authorization Code OAuth flow WITH client_secret (server-side
  confidential client). NOT PKCE — the Express server can securely store
  the secret. No client_secret should ever appear in browser/client code.
- Token storage in Prisma OAuthToken table
- Automatic token refresh (expires_in = 3600s) — ensureFreshToken() before
  every API call
- Playback: PUT https://api.spotify.com/v1/me/player/play
  - To start playlist: body { context_uri: "spotify:playlist:ID" }
  - To start track:    body { uris: ["spotify:track:ID"] }
- Search: GET https://api.spotify.com/v1/search?q=...&type=track,playlist
- Device listing: GET https://api.spotify.com/v1/me/player/devices

## Rate-limit handling
Spotify returns HTTP 429 with a Retry-After header. The client wrapper must:
1. Read the Retry-After value (seconds).
2. Wait that duration.
3. Retry the request once.
4. If still 429, log error and skip (don't block the BPM pipeline).

## Key files
src/spotify/client.ts    → all Spotify API calls + token refresh + 429 handling
src/routes/auth.ts       → OAuth login + callback routes
src/routes/spotify.ts    → search proxy route

## Common gotchas
- Spotify requires an ACTIVE device. If /me/player/play returns 404, no
  device is active. Surface this clearly in the dashboard.
- Playback SDK creates a new in-browser player — do NOT use it. Use the
  REST API to control the user's existing phone/desktop Spotify.
- The code_verifier / code_challenge pattern is NOT used here — that's PKCE.
  This project uses the simpler Authorization Code flow with client_secret
  passed in the token exchange POST body.
```

---

### `db-migrator.md`

```yaml
---
name: db-migrator
description: >
  Safe-guard for Prisma schema changes and migrations. Invoke when any task
  requires modifying the Prisma schema, adding models, or running migrations.
tools: Read, Write, Edit, Bash
model: sonnet
---

You are the database migration specialist for Heart Beater MC.

## Rules — always follow these, no exceptions
1. Never modify schema.prisma without immediately running:
   `npx prisma migrate dev --name <snake_case_description>`
2. Never use SQLite-specific column types (e.g. no Blob, no specific
   date formats not portable to PostgreSQL).
3. After any migration, run `npx prisma generate` to update the client.
4. Never edit migration files in /prisma/migrations/ manually.
5. Test that `npx prisma migrate deploy` would succeed against a fresh DB
   by running it against a copy: `DATABASE_URL="file:./test.db" npx prisma migrate deploy`

## Current models
- BpmRule: id (cuid), bpm (Int @unique), spotifyUri, spotifyType, label, createdAt
- OAuthToken: id (cuid), service (String @unique), accessToken, refreshToken, expiresAt

## Migration path to PostgreSQL (vnext)
Only two changes required — no app code changes:
1. Change provider to "postgresql" in schema.prisma
2. Update DATABASE_URL in .env to Supabase connection string
3. Run `npx prisma migrate deploy`
```

---

## 4. Slash Commands (`.claude/commands/`)

### `/implement` — The main Linear workflow trigger

**`.claude/commands/implement.md`**
```markdown
Invoke the `linear-implementer` sub-agent to implement Linear issue $ARGUMENTS.

If no issue ID is provided, list the top 5 open Linear issues assigned to me
and ask which one to work on.
```

**Usage:** `/implement HB-12`

---

### `/extend-schema` — Safely modify the Prisma schema

**`.claude/commands/extend-schema.md`**
```markdown
Safely extend the Prisma schema with a new field or model. Steps:

1. Ask the user: what model and what field/change?
2. Invoke the `db-migrator` sub-agent to make the schema change and run migration.
3. Update any affected route handlers in /server/src/routes/.
4. Update the React UI in /client/ if the new field should be user-visible.
5. Run `npm run typecheck` and fix all errors.
6. Summarise what was changed.

NOTE: Adding a BPM rule (e.g. "add a rule at 140 BPM for playlist X") is a
runtime CRUD operation done through the app UI — it does NOT require code changes.
This command is for changing the schema structure itself (e.g. adding a "shuffle"
field to BpmRule, or adding a new model).
```

---

### `/check-types` — Fast typecheck across all workspaces

**`.claude/commands/check-types.md`**
```markdown
Run TypeScript typechecks across all workspaces and summarise errors:

1. Run `cd server && npx tsc --noEmit 2>&1 | tail -30`
2. Run `cd client && npx tsc --noEmit 2>&1 | tail -30`
3. Present a clean summary: N errors in server, M errors in client.
4. If errors > 0, ask if you should fix them now.
```

---

### `/sync-linear` — Pull current Linear state

**`.claude/commands/sync-linear.md`**
```markdown
Use the Linear MCP server to fetch all open issues for the Heart Beater MC
project. Display them in a concise table: ID | Title | Status | Priority.
Ask which issue to work on next, then invoke /implement <ID>.
```

---

## 5. Hooks (`.claude/hooks/`)

### `pre-commit.sh` — Block bad commits

**`.claude/hooks/pre-commit.sh`**
```bash
#!/bin/bash
# PreToolUse hook — blocks git commit if typecheck or tests fail

echo "Running pre-commit checks..."

cd "$(git rev-parse --show-toplevel)"

# TypeScript check
npx tsc --noEmit --project server/tsconfig.json 2>&1
SERVER_EXIT=$?
npx tsc --noEmit --project client/tsconfig.json 2>&1
CLIENT_EXIT=$?

if [ $SERVER_EXIT -ne 0 ] || [ $CLIENT_EXIT -ne 0 ]; then
  echo "❌ TypeScript errors detected. Fix them before committing." >&2
  exit 2  # Exit code 2 = block operation + show message to Claude
fi

# Tests
npm run test --silent 2>&1
TEST_EXIT=$?
if [ $TEST_EXIT -ne 0 ]; then
  echo "❌ Tests failed. Fix failing tests before committing." >&2
  exit 2
fi

echo "✅ Pre-commit checks passed."
exit 0
```

Wire in `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [{ "type": "command", "command": ".claude/hooks/pre-commit.sh" }]
      }
    ]
  }
}
```

---

### `post-edit-typecheck.sh` — Surface type errors immediately

> ⚠️ **Known issue:** The `$FILE` variable may not resolve correctly depending on how Claude Code interpolates tool arguments into hook commands. If this hook silently does nothing (both `if` conditions fail), replace it with a simpler version that always runs both typechecks — the project is small enough that this is fast. Test this hook early and disable if unreliable.

**`.claude/hooks/post-edit-typecheck.sh`**
```bash
#!/bin/bash
# PostToolUse hook — runs tsc after file edits in server/ or client/
# Prints errors to stdout so Claude sees them in the next turn

# Fallback: if no file argument, run both typechecks
if [ -z "$1" ]; then
  cd "$(git rev-parse --show-toplevel)"
  npx tsc --noEmit --project server/tsconfig.json 2>&1 | grep "error TS" | head -5
  npx tsc --noEmit --project client/tsconfig.json 2>&1 | grep "error TS" | head -5
  exit 0
fi

FILE="$1"

if [[ "$FILE" == server/* ]]; then
  cd server && npx tsc --noEmit 2>&1 | grep "error TS" | head -10
elif [[ "$FILE" == client/* ]]; then
  cd client && npx tsc --noEmit 2>&1 | grep "error TS" | head -10
fi
```

Wire in `.claude/settings.json` (merged with pre-commit hook):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [{ "type": "command", "command": ".claude/hooks/pre-commit.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": ".claude/hooks/post-edit-typecheck.sh \"$FILE\"" }]
      }
    ]
  }
}
```

> ⚠️ This hook adds token overhead. If context pressure becomes a problem, disable it and rely on `/check-types` instead.

---

## 6. MCP Server Configuration

**`.claude/mcp.json`**
```json
{
  "mcpServers": {
    "linear": {
      "type": "url",
      "url": "https://mcp.linear.app/sse",
      "name": "linear"
    }
  }
}
```

The Linear MCP server is available to:
- The `linear-implementer` sub-agent (primary consumer)
- The `/implement` and `/sync-linear` commands
- The main Claude Code agent (for ad-hoc issue queries)

---

## 7. Context Efficiency Summary

| Asset | Context loaded | When |
|---|---|---|
| Root `CLAUDE.md` | Always (~500 tokens) | Every session |
| `/server/CLAUDE.md` | Only when in /server | Layer work |
| `/client/CLAUDE.md` | Only when in /client | Layer work |
| `/garmin/CLAUDE.md` | Only when in /garmin | CIQ work |
| `linear-implementer` | Sub-agent own context | On /implement |
| `spotify-specialist` | Sub-agent own context | On Spotify tasks |
| `db-migrator` | Sub-agent own context | On schema changes |

Heavy domain knowledge (Spotify API quirks, CIQ backoff patterns, Prisma migration rules) is either in sub-agents (for complex/risky domains) or in layer-level CLAUDE.md files (for simpler domains). The threshold engine logic and Garmin CIQ patterns are documented in `/server/CLAUDE.md` and `/garmin/CLAUDE.md` respectively — they didn't warrant separate sub-agents given the small amount of domain knowledge involved.

---

## 8. Recommended Implementation Order

1. **Create root `CLAUDE.md`** — foundation for everything else.
2. **Create layer sub-CLAUDEs** — `/server/CLAUDE.md`, `/client/CLAUDE.md`, `/garmin/CLAUDE.md`.
3. **Configure Linear MCP** — `.claude/mcp.json` with the Linear server URL.
4. **Create `linear-implementer` sub-agent** — this is the primary productivity multiplier.
5. **Add `/implement` and `/sync-linear` commands** — surfaces Linear workflow in the terminal.
6. **Create remaining sub-agents** — `spotify-specialist` → `db-migrator`.
7. **Add pre-commit hook** — quality gate.
8. **Add post-edit typecheck hook** — optional, test early, disable if `$FILE` doesn't resolve.
9. **Add `/check-types` and `/extend-schema` commands** — quality-of-life shortcuts.

---

## 9. Linear Workflow Pattern

The recommended pattern for using Linear with Claude Code on this project:

```
You: /sync-linear
Claude: Shows open issues table — HB-03, HB-07, HB-11...

You: /implement HB-07
linear-implementer agent:
  → Fetches issue from Linear MCP
  → Sets status: In Progress
  → Reads relevant CLAUDE.md files
  → Implements feature
  → Runs typecheck + tests
  → If issue touches /garmin/: notes manual build required in summary
  → Sets status: In Review
  → Posts implementation summary as Linear comment

You: Review the code, approve, merge PR
You: If garmin changes: manually compile + sideload CIQ app
You: (In Linear) move to Done
```

This keeps Linear as the single source of truth for work state, and Claude Code as the implementer — with no manual status updates required from you.

---

*This document should be stored at `/docs/claude-code-assets.md` in the repository and referenced from the root `CLAUDE.md` so Claude Code can find it if it needs to understand the overall agent architecture.*
