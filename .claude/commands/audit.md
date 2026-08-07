---
description: Read-only codebase health audit — tech debt, dead code, comment rot, docs drift. Produces a report and proposed backlog edits; NEVER auto-fixes.
---

# Audit: Codebase Health Report

## Ground rules (read first)

- **Read-only.** This command changes nothing: no code edits, no migrations, no doc rewrites. The deliverable is a report in chat plus a proposed diff for the backlog that Evan can accept or reject. If a finding is urgent (a live bug, a leaked secret), flag it at the TOP of the report.
- **If the project has a live database and read access is approved, it is SELECT-only.** Read queries (`select`, `explain`, catalog reads) only. Never `insert/update/delete/alter/drop`, never apply a migration, never touch auth config or secrets.
- **Intentionally-retained code is not dead code.** Before flagging anything as unused, check whether the project documents it as deliberately kept (feature-flagged surfaces, staged re-introduction hooks, deprecation shims). When unsure, list it as a QUESTION, not a finding.

## 1. Dead code

- Unused exports/modules/hooks/components: cross-reference `export` sites against import sites (`grep -rn` or a sweep agent). Exclude barrel re-exports that exist for the public module surface.
- Orphaned assets, unused analytics events (declared but never fired), unreferenced test ids, dead feature-flag branches.
- Commented-out code blocks and `.skip`ped tests.

## 2. Tech debt

- Inventory `TODO` / `FIXME` / `HACK` / `XXX` comments with file:line.
- Diff reality against the backlog: what's listed there is already fixed (stale entry) and what exists in code but isn't listed (missing entry).
- Lint warning count by rule — warnings are the debt ledger.

## 3. Comment rot

- Historical-era citations in comments (phase / chapter / sprint numbers, PR numbers, "the rewrite"): comments should state constraints, not history.
- Comments contradicting current behavior: spot-check top-of-file comments on the largest recently-changed files against what the code actually does (layout claims, routing claims, "X is a stub" claims).
- Stale doc anchors: section references that don't resolve against current headings.

## 4. Docs currency

- README: setup steps that still work, status claims vs reality.
- The rules file (CLAUDE.md): stack claims (deps added/removed), commands that still run, open-decisions list (anything decided since?), key-files list.
- Backlog: items already done, sections describing completed work as future.
- Product spec: surfaces shipped since the last rewrite that aren't reflected.
- A changelog is append-only history — don't audit it for currency, only confirm recent work was recorded.

## 5. Data layer (only if the project has one, read-only)

- **Empty/useless columns:** row counts + per-column non-null counts. Flag columns that are 100% NULL (or a constant default) across a meaningfully-sized table.
- **Zero-row tables** that aren't new.
- **Authorization coverage:** every table reachable by a client has its access rules defined and tested.
- **Referential integrity:** every FK declares an explicit `on delete` action, so account/tenant deletion can't silently break.
- **Migration parity:** local migration count vs what's actually applied.
- **Index health (light):** only report duplicates or an index missing on a hot FK.

## 6. Report format

Deliver in chat, in this order:

1. **Urgent** (anything that shouldn't wait; usually empty)
2. **Summary table** — one row per section: finding count, severity mix
3. **Findings** per section, each with file:line (or table.column) evidence and a one-line proposed disposition (fix now / backlog / question for Evan)
4. **Proposed backlog diff** — a single fenced block of suggested edits
5. **Questions** — judgment calls and anything needing Evan's decision

Do not act on any finding in the same session unless Evan explicitly says so.
