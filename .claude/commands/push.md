---
description: Push the current branch to GitHub. Evan opens the PR manually on the web — do NOT create it (`gh pr create`).
---

## 1. Pre-push gate (blocking) — mirror CI locally
Do NOT pipe gate commands to `| tail` (it masks exit codes). If any check fails, STOP and fix — never push red.

Run every check CI runs. Fill this list in per project; the usual set is:

- typecheck
- lint
- format check
- unit tests
- build

Never claim a check is green if you didn't actually run it. If a check can't run locally (missing tooling, missing service), say so plainly and flag that CI will gate the PR on it.

## 2. Docs current?
Confirm the repo's changelog / README cover what's in this push. If a doc is missing, make a small `docs(...)` commit BEFORE pushing.

## 3. Push the branch (only)
- If on `main`, STOP — push a feature branch.
- `git push -u origin <branch>`. Do NOT open a PR.
- If the push is rejected (behind remote), report it — don't force-push without asking.

## 4. Hand off a paste-ready PR summary (in chat)
- **Title:** commit-shaped one-liner.
- **Body:** what changed + why (bullets), every gate result (which ran + passed, which were skipped/flagged and why), and any manual verification still owed.
- **Base branch** to target.
