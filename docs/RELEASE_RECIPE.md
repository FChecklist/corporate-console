# Console release recipe (master console, after the owner says yes)

Live now: Pages deployment **ddf54f7a** (project corporate-console). That id is the rollback target: if anything is wrong after the deploy, roll the project back to ddf54f7a in the Pages dashboard (Deployments, ddf54f7a, Rollback) or `wrangler pages deployment list` then redeploy that build. Note the new deployment id next to it.

Before you start: the head is the tested head (suite counts known), the working tree is clean, `docs/OWNER_ACTIONS.md` items 1-6 are done or knowingly skipped (the mail key and the report secrets are only needed for the report mail).

1. Database: apply `migrations/0002_report_hold.sql` (report_hold, report_watch) and `migrations/0003_funnel_hit.sql` (funnel_hit) to the console database. The code also creates the tables on first use.
2. `node tools/vendor-core.mjs <corporate-game-core clone> --expect 0.1.0` only if the core changed; otherwise the vendored manifests stay (pinned 0.1.0, 9c6419d).
3. Stamp: `node tools/deploy/stamp-release.mjs`
4. Commit **releases.json last** (nothing else after it): `git add releases.json && git commit -m "Release stamp for the deploy"`
5. Build: `node build.mjs --env preview` (live: `--env live`, with the real commit). It refuses if config/games.json and the vendored core disagree.
6. Check: `node tools/deploy/check-dist.mjs --deploy` must say dist is fresh and carries the commit and today's release time.
7. Deploy: `wrangler pages deploy dist --project-name corporate-console --branch main --commit-dirty=true`
8. Verify: the sign-in screen, `/version.json` (version, commit, release time), `#/control` and `#/create/from` open after sign-in.
9. Roll back if needed: ddf54f7a.
