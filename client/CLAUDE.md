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
