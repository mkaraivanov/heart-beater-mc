Run `tsc --noEmit` in both the `/server` and `/client` workspaces.

Present a clean summary in this format:

```
Typecheck results
─────────────────────────────
server   X errors
client   X errors
─────────────────────────────
Total    X errors
```

If the total error count is 0, report success and stop.

If errors > 0, show the full error list grouped by workspace, then ask the user if they want you to fix the errors now.
