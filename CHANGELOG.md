# Changelog - corporate-console

Newest first. Rule: every deploy bumps the version and adds an entry here (standard of 20 Nov 2026).

## 0.1.2 - 25 Nov 2026 (not deployed yet; the release time is stamped at deploy)
### Added
- The small mark "१३९" (6px, bold, dark blue #0B2A6B, thin dark red line under it) at the very top centre of every page, once per page, not blocking clicks, hidden from screen readers. Pages: `public/index.html`, `public/signin.html`, `public/pay-link.html`, `public/owner-funnel/index.html`, `packages/game-pack/gamelog.html`, the games chooser page (`chooser.mjs`) and the sign-in link page (`functions/_lib/auth-core.ts`). CSS once in `public/core/tokens.css` and `packages/game-pack/pack.css`.
- PR #10 (`p1/mark-139-2026-11-25`). Guard test: `tests/mark139.test.ts` (walks every .html page in the repo, plus the generated pages). No payment code touched; money flag unchanged.

## 0.1.1 - 20 Nov 2026 (not deployed yet; the release time is stamped at deploy)
### Fixed
- A paid notice whose first try failed with a one-off error (for example a busy database) is no longer stuck: the order row stays `marking` only for a 30 second lease; the next try after it takes the row over (one winner) and finishes marking the game. A game that is already paid is never marked again. Where: `packages/bridge/src/bridge.ts` (`MARK_LEASE_MS`, route `/api/console/paid`). The lease itself was added in the pay step (commit eceb9ce, finding C-3); this release adds the regression tests and the note that every game must **re-vendor the bridge** (older vendored copies still answer 409 `in_progress` for ever).
- Tests: `tests/bridge-stale-marking.test.ts` (database error then retry; wait inside the lease; two retries at once; already paid is a no-op; repeated failures). Checked by breaking the takeover on purpose: the tests go red, then green again.
### Changed
- `docs/GAME_PAY_CONTRACT.md`: re-vendor note.
- PR #4 (`claude/bridge-stale-marking-fix`). Audit: not done yet. Rollback id of the previous deploy: `706f8e60` (commit 9c57a81); before that `7489a57e-72a7-4a35-b7b5-3e4b824cf23c`.

## 0.1.0 - 20 Nov 2026
### Added
- The pay step for all six games (dark: `PAY_VIA_MONEYPENNY` off): `functions/_lib/pay-core.ts`, `packages/game-pack/zc-flow.js`, `public/pay-link.*`, migration `0004_game_pay.sql`. Audits: two PASS on 3173ba7. Deployment `706f8e60`; rollback `7489a57e-72a7-4a35-b7b5-3e4b824cf23c`.
