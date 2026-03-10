**IMPORTANT CLARIFICATION — read before proceeding:**
This command is for **structural schema changes** (adding/removing models or fields, changing types, adding indexes/relations). If you need to add runtime data — such as creating a new BPM rule via the app UI — you do NOT need this command. Use the app's normal interface instead.

---

Ask the user what model or field they want to add, remove, or change. Confirm the change with them before proceeding.

Once confirmed:

1. Invoke the `db-migrator` sub-agent to make the Prisma schema change and run the migration.
2. After the migration completes, update any affected route handlers (API endpoints that read/write the changed model).
3. Update any affected React UI components that display or submit the changed data.
4. Run `/check-types` to verify there are no TypeScript errors introduced by the schema change.
5. Report a summary of all files changed.
