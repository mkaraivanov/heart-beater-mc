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
