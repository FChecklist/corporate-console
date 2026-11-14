# Corporate Games master console

One sign-in, six games, billing. Plain static pages plus a small sign-in service on Cloudflare Pages.
Plan: `C:\ct\test-sites\docs-games\MASTER_CONSOLE_BUILD_PLAN.md`.

- `tools/` test tools shared by every game repo (falsification runner, one-heavy-job wrapper, viewport kit)
- `docs/CONTRACT_V1.md` and `contract/` the frozen contract between console and games
- `packages/bridge/` the ONE bridge module that is copied byte for byte into every game

Rules: no secret or token in this repo (names only in `config/SECRETS_NAMES.md`); nothing is deployed without the owner's go.


See [KNOWLEDGE-MAP.md](KNOWLEDGE-MAP.md) for what this repository is for and what the other repositories are for (updated 14 Nov 2026).
