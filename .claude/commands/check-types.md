Run TypeScript typechecks across all workspaces and summarise errors:

1. Run `cd server && npx tsc --noEmit 2>&1 | tail -30`
2. Run `cd client && npx tsc --noEmit 2>&1 | tail -30`
3. Present a clean summary: N errors in server, M errors in client.
4. If errors > 0, ask if you should fix them now.
