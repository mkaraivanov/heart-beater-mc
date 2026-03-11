# /dev-start

Start the full Heart Beater MC development stack.

## Steps

1. **Check dependencies** — verify `node_modules` exist in both workspaces:

```bash
ls server/node_modules client/node_modules > /dev/null 2>&1 || (echo "Missing node_modules — run: npm install" && exit 1)
```

2. **Remind about ngrok** — the Garmin CIQ app (Android) requires HTTPS via ngrok. Print this reminder:

```
⚠️  NGROK REMINDER
If the Garmin watch app is active, ngrok must be running and NGROK_URL in .env
must match the current tunnel URL. Start ngrok with:

  ngrok http 3001

Then update NGROK_URL in .env before sideloading the CIQ app.
```

3. **Start the server** (port 3001):

```bash
npm run dev:server
```

4. **Start the client** (port 5173) — run in a second terminal or background process:

```bash
npm run dev:client
```

## Notes
- The BPM→Spotify pipeline works without a browser tab open (dashboard is optional).
- Ensure `.env` contains valid `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `BPM_API_KEY`, and `DATABASE_URL` before starting.
- Spotify OAuth callback URL must be registered as `http://localhost:3001/auth/spotify/callback` in the Spotify Developer Dashboard.
