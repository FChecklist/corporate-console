# End-to-end tests (real browser)

`e2e/part1/` is Part 1 of the owner's testing split: the organizer journey across home and console, 20 steps, one spec file per step group plus permutations (new or returning organizer, desktop and phone size, slow network, refresh mid-step, back button, expired session or code, double click, wrong input, ID list with bad rows, all four start formats).

Result of the last local run: [`part1/RESULTS.md`](part1/RESULTS.md) (step x permutation table, pass / fail / blocked and why).

## What you need
- Bun (the repo already uses it) and `bun install` once (this installs `playwright-core`, already a devDependency).
- A Chromium. The harness looks for `E2E_CHROMIUM`, then `PLAYWRIGHT_BROWSERS_PATH`, then `/opt/pw-browsers`, then `~/.cache/ms-playwright`; otherwise Playwright's own default. On a machine without one: `bunx playwright-core install chromium`.

## Run it on your own machine against the local build (the default; changes nothing anywhere)
```bash
bun install
bun run e2e:part1
```
That starts a local stack by itself (`e2e/part1/lib/stack.ts`: the real console build with its real `_headers`, the real sign-in service on an in-memory database, six fake games that speak contract v1, a test mailbox, a clock the tests can move, and a payment stand-in) and writes `e2e/part1/RESULTS.md`. About 2 minutes. Nothing leaves the machine and no secret is used. One file or one scenario:
```bash
bun test e2e/part1/12-payment.spec.ts
bun test e2e/part1 -t "double-clicking Pay"
```

## Run it against the live sites (read-only)
```bash
E2E_BASE_URL=https://console.corporatetambola.com \
E2E_HOME_URL=https://home.corporatetambola.com \
bun test e2e/part1
bun e2e/part1/report.ts
```
Rules the suite follows when `E2E_BASE_URL` is set:
- Only scenarios flagged `live: "safe"` run: they open pages and read. They sign nobody in, create nothing, pay nothing, send no mail.
- Every other scenario is recorded as `skipped-live` (it needs the test mailbox, a moved clock, or changes data), so the table shows what was NOT checked.
- `E2E_HOME_URL` is read with a plain GET only.
- A signed-in live check is possible by giving a saved session: log in once by hand, save it with Playwright (`context.storageState({ path })`), and pass `E2E_STORAGE_STATE=path`. (Reserved for a later part; the current safe scenarios do not need it.)
- Never point `E2E_BASE_URL` at production with a scenario that is not flagged safe: add `live: "safe"` only to scenarios that read.

## Settings
| Variable | Meaning | Default |
|---|---|---|
| `E2E_BASE_URL` | Console address. Empty = start the local stack. | empty (local) |
| `E2E_HOME_URL` | Home site address (GET only). | `https://home.corporatetambola.com` |
| `E2E_CHROMIUM` | Path of a Chromium binary. | auto-detect |
| `E2E_SLOWMO` | Milliseconds of delay between browser actions, to watch a run. | 0 |
| `E2E_STORAGE_STATE` | Saved signed-in session for live runs. | none |

## How the stand-ins work (so a result can be trusted)
- **Mail**: the console records every mail to an address ending `.invalid` (and a test mailer receives it); the tests read the code from `GET /__stack/mail`. No mail service is involved.
- **Moneypenny / payment**: `POST /__stack/game/pay` with mode `ok` (provider confirms), `busy` (the safe "off / busy" state: nothing changes) or `fail`. It cannot take money and nothing in this repo calls a real provider.
- **The games**: `tools/fake-game/server.mjs` plus the control route and the optional row fields of `docs/CONTROL_CONTRACT.md`. The games' own wizard, upload, payment page and play are not in this repository; those steps are marked `blocked` with the reason.
- **Clock**: `POST /__stack/clock {advanceMs}` moves the console's and the fake games' clock (code expiry, sessions, 24 h / 365 d rules).

## Adding a scenario
```ts
scenario(13, "dblclick", "what must be true", async () => { await withOrg({}, async (o) => { /* o.page is a Playwright page */ }); }, { live: "safe" /* only if it reads */ });
blocked(10, "new+desktop", "what cannot be tested here", "why, naming the repository that owns it");
```
