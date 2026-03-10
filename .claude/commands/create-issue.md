# /create-issue

Create a new Linear issue in the **Heart Beater MC** project following the established format.

## Usage

```
/create-issue <title> [phase] [priority]
```

Or call without arguments and Claude will ask you for the details interactively.

---

## Workflow

1. Ask the user (if not already provided):
   - **Title** — short, imperative sentence (e.g. "Implement Spotify OAuth callback")
   - **Phase** — which implementation phase this belongs to:
     - Phase 1: Core Server + Spotify OAuth
     - Phase 2: BPM Receiver + Threshold Engine
     - Phase 3: Connect IQ Watch App
     - Phase 4: React Dashboard
     - Phase 5: Polish + Error Handling
   - **Priority** — Urgent / High / Normal / Low (default: Normal)
   - **Brief description** — what needs to be done and why (1–3 sentences is enough; Claude will expand it)
   - **BRD references** — which FR/NFR IDs from the Business Requirements apply (e.g. FR-01, NFR-02)
   - **Dependencies** — any other HB issue IDs this depends on (optional)

2. Draft the full issue body using the **Issue Template** below.

3. Show the drafted issue to the user and ask for confirmation before creating it in Linear.

4. On confirmation, create the issue in Linear:
   - **Project:** Heart Beater MC
   - **Team:** Mkaraivanov
   - **Milestone:** matching the phase (Phase 1 – Phase 5)
   - **Priority:** as specified
   - **State:** Todo

5. Report back the created issue identifier (e.g. HB-23) and Linear URL.

---

## Issue Template

Use this exact structure for every issue body. All sections are required; write "N/A" if a section genuinely doesn't apply.

```markdown
## Overview

<2–4 sentence plain-English description of what this issue covers and what
"done" looks like from a user or system perspective.>

---

## Business Justification

<Which requirements from the BRD this issue satisfies. List each FR/NFR ID
with a one-line summary of what it requires.>

| Requirement | Summary |
|---|---|
| FR-XX | <what it requires> |
| NFR-XX | <what it requires> |

---

## Technical Implementation

<Step-by-step breakdown of what Claude Code needs to do. Be specific: file
paths, function names, API endpoints, data shapes. Reference the Technical
Implementation Plan section where relevant (e.g. "See Tech Plan §4.2").>

### Steps
1. ...
2. ...
3. ...

### Key files / paths
- `<path>` — <purpose>

### API / data shapes (if applicable)
\`\`\`json
{ "example": "payload" }
\`\`\`

---

## Acceptance Criteria

- [ ] <Specific, testable criterion>
- [ ] <Specific, testable criterion>
- [ ] TypeScript compiles with zero errors (`npm run typecheck`)
- [ ] Relevant tests pass (`npm run test`)

---

## Dependencies

<List any HB issue IDs that must be completed before this one, or "None".>

---

## Notes for Claude Code

<Any gotchas, constraints, or reminders specific to this issue. Examples:
"Do not use PKCE", "X-BPM-Key header is required on every request",
"Manual CIQ build required — do not attempt to compile Monkey C".>
```

---

## Rules

- Never create an issue without user confirmation of the drafted body first.
- Always assign to the **Heart Beater MC** project and the correct phase milestone.
- BRD and Technical Plan documents are at `/docs/` in the repository — read them if you need to fill out sections you're unsure about.
- If this issue touches `/garmin/`: add a note that manual CIQ SDK compilation and sideloading is required.
- If this issue touches the Prisma schema: add a note to invoke the `db-migrator` sub-agent.
- Keep Acceptance Criteria testable and binary — avoid vague criteria like "works correctly".
