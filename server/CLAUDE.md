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
