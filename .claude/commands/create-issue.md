Interactive command for creating a new Linear issue in the Heart Beater MC project.

**RULE: Never create the issue in Linear without explicit user confirmation. Always show the full draft first.**

---

## Step 1 — Gather information

Ask the user for the following, one at a time (or all at once if they provide a summary):

1. **Title** — short, imperative (e.g. "Add BPM averaging endpoint")
2. **Phase / Milestone** — which project phase this belongs to (e.g. Phase 1 — Core Server)
3. **Priority** — Urgent / High / Medium / Low
4. **Description** — what needs to be built and why (can be a rough brain-dump; you will shape it)
5. **BRD references** — any BRD section numbers or requirement IDs this satisfies (optional)
6. **Dependencies** — other MKA issue IDs this depends on (optional)

---

## Step 2 — Draft the issue body

Using the gathered information, produce a full issue body using this template:

```
## Overview

<1–3 sentence summary of what this issue delivers and why it matters>

---

## Business Justification

| Requirement | Summary |
| -- | -- |
| <BRD ref or "Internal"> | <one-line justification> |

---

## Technical Implementation

### Steps

<Numbered list of implementation steps>

### Key files / paths

* <list relevant files or directories>

---

## Acceptance Criteria

- [ ] <testable criterion 1>
- [ ] <testable criterion 2>
- [ ] ...

---

## Dependencies

* <MKA-XX — description, or "None">

---

## Notes for Claude Code

* <Any specific instructions for the implementing agent>
<If Prisma schema is involved, add:> * Schema changes require the `db-migrator` sub-agent — invoke via `/extend-schema`.
<If Garmin Connect IQ is involved, add:> * Garmin changes require a manual Connect IQ build and sideload — note this in the Linear summary comment after implementation.
```

---

## Step 3 — Show draft and confirm

Display the full draft (title + body) and ask: **"Create this issue in Linear? (yes / edit / cancel)"**

- **yes** → proceed to Step 4
- **edit** → ask what to change, update the draft, show it again, repeat
- **cancel** → stop, do not create anything

---

## Step 4 — Create the issue

Create the issue in Linear with:
- **Project**: Heart Beater MC
- **Milestone**: the phase selected in Step 1
- **Priority**: as selected
- **Title and description**: from the confirmed draft

Report the created issue ID and URL.
