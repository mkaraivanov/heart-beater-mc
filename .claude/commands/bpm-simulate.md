# /bpm-simulate

Fire a test BPM POST to the local server to simulate a heart rate reading from the Garmin watch.

**Usage:** `/bpm-simulate <bpm>`

Example: `/bpm-simulate 145`

## Steps

1. **Read the API key** from the environment (never hardcode it):

```bash
BPM_API_KEY=$(grep '^BPM_API_KEY=' .env | cut -d'=' -f2)
if [ -z "$BPM_API_KEY" ]; then
  echo "Error: BPM_API_KEY not found in .env" >&2
  exit 1
fi
```

2. **POST the BPM value** to the server with the required `X-BPM-Key` header:

```bash
BPM=${ARGUMENTS:-120}
curl -s -X POST http://localhost:3001/api/bpm \
  -H "Content-Type: application/json" \
  -H "X-BPM-Key: $BPM_API_KEY" \
  -d "{\"bpm\": $BPM}" | jq .
```

3. **Interpret the response**:
   - `200 OK` with `{ "activeRule": ... }` — a threshold rule matched and Spotify was (or would be) triggered.
   - `200 OK` with `{ "activeRule": null }` — BPM is below all thresholds; current playback continues unchanged.
   - `401 Unauthorized` — `BPM_API_KEY` in `.env` does not match the server's configured key.
   - `429` or cooldown message — a Spotify switch happened within the last 15 seconds; try again after the cooldown.

## Notes
- The server must be running on port 3001 (`npm run dev:server`).
- `$ARGUMENTS` is replaced with whatever value you pass after `/bpm-simulate` (e.g., `145`). Defaults to `120` if omitted.
- The threshold engine picks the **highest** rule whose `bpm` threshold is ≤ the posted value.
