# State of the master console programme (pointer) - updated 29 October 2026

Full hand-overs: `C:\ct\test-sites\handover\2026-10-27\30-console-build-2026-10-27.md` (first build), `100-console-spec-2026-10-29.md` (the spec that wins), `102-master-console-2026-10-29.md` (this completion session).

1. Done locally, nothing deployed, nothing created in Cloudflare: the master console is complete to spec 100 section 5.1 (M1-M8): sign-in, Home (3 doors), My games, Create (5 tiles + a quiet Lucky Draw tile), Billing, Account (Sign out, Close my account), Player's screen view, five-item menu, light and dark, laptop and phone, the shared Corporate Games bar.
2. Decisions applied: today's prices only (one price list); sign-in tables can live in the console's own database or under `TABLE_PREFIX` in an existing one (no database created); origins housie. / home.; nothing links to console.corporatetambola.com until it is live.
3. Contract additions (all optional): hand-off `target: "new"`; `roleId` on an invitation row. The four game bridge worktrees still hold the OLD bridge copy: re-vendor (`node tools/vendor-bridge.mjs --game <worktree>`) in each game's own package.
4. NOT in this repo's scope and still to do (spec 100 wave 2): each game's own console page and edge work (BE/BW, TE0/TE/TW, SE/SW, LK0/LK1/LE/LW, TB0), the shared game pack (C3), Lucky Draw, the cross-game simulations (X1, X3).
5. Go-live is owner-gated: see `docs/GO_LIVE_RUNBOOK.md` (ten steps, each with Verify and Rollback) and the questions in its Step 0.
