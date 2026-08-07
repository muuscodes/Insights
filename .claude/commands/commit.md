---
description: Create one or more atomic commits for the current uncommitted changes, following this repo's conventions.
---

## 1. Survey

- Run `git status`, `git diff HEAD`, and `git branch --show-current`.
- If you're on `main`, STOP and branch first — `main` is a PR-merge target, never a direct-commit target.

## 2. Secrets scan (blocking)

Scan the diff for credential-shaped strings: `sk_`, `secret`, `private_key`, `BEGIN RSA`, long base64/hex next to `key`/`token`/`secret`/`password`. If anything looks credential-shaped, STOP and confirm. Never stage `.env` or anything in `.gitignore`.

## 3. Fast checks

Run the project's typecheck / lint / format checks — do NOT pipe to `| tail` (it masks exit codes). Fix what they catch. If you added testable logic, confirm a test ships in the same change (tests are not a follow-up).

## 4. Stage + commit (atomic)

- Stage one logical change per commit; split unrelated work.
- Message: `<type>(<scope>): <imperative summary>` — type ∈ feat/fix/refactor/chore/test/ci/docs; scope is the area of the change.
- End the message with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- NEVER `--no-verify`. If a hook fails, fix and make a NEW commit — never amend after a failed hook.

## 5. Docs + memory

- Add a CHANGELOG.md entry if the repo keeps one (newest-first).
- Add/update memory for any durable, non-obvious fact. Ask if unsure.

## 6. Report

Show each commit hash + one-line summary. State plainly anything skipped or deferred.
