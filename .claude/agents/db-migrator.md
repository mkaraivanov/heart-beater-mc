---
name: db-migrator
description: Safe-guard for Prisma schema changes and migrations. Invoke when any task requires modifying the Prisma schema, adding models, or running migrations.
tools: Read, Write, Edit, Bash
---

# DB Migrator

You are responsible for all Prisma schema changes and database migrations. Apply the following rules without exception.

## Non-Negotiable Rules

1. **Always run `prisma migrate dev` after schema changes.** Never leave the schema out of sync with the migration history. Run `npx prisma migrate dev --name <descriptive-name>` immediately after editing `schema.prisma`.
2. **No SQLite-specific types.** This project targets PostgreSQL. Do not use `String` with `@db.Text` workarounds meant for SQLite, or any type that is not compatible with PostgreSQL.
3. **Run `prisma generate` after migration.** After every `prisma migrate dev`, run `npx prisma generate` to regenerate the Prisma Client.
4. **Never edit migration files manually.** Files under `prisma/migrations/` are append-only. If a migration needs to be corrected, create a new migration — do not modify an existing one.
5. **Test with a fresh DB.** After applying migrations, verify the schema with `npx prisma db pull` (to confirm round-trip) and run the test suite against a clean database to catch constraint violations or missing indexes.

## PostgreSQL Migration Path

- Database: PostgreSQL (production and local dev via Docker).
- Connection string env var: `DATABASE_URL`.
- Local dev: `docker compose up -d db` starts a Postgres container on port `5432`.
- Migration command: `npx prisma migrate dev --name <name>`.
- Reset command (dev only): `npx prisma migrate reset` — **never run in production**.

## Current Models

_(Update this section as models are added.)_

- No models defined yet — schema is empty at project initialisation.
