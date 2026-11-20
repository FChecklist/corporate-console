# Versioning to do (Corporate Games master console)

Not done in the docs-only pass (no app code was changed). The game's own session does these inside its PR:
1. Add `version.json` (source file, schema in the standard section 2.1: product, version, commit, builtAt, changes[last 20]: id, what, where, pr). The console already serves version (0.1.0), releasedAt, commit, env, consoleVersion; add the `changes` list and `product`.
2. Pick the first version number and write it: live is 0.1.0 (consoleVersion in /version.json); the pay step for all games is a new feature = 0.2.0 or the owner may choose 1.0.0.
3. Show `vX.Y.Z` in the site footer and link it to `/changes`.
4. Add the `/changes` page (plain-English "What's new", last 10 changes, user words only, NO security details, NO internal ids), reading from `/version.json`. Keep the X-Robots-Tag noai protection headers. Do not publish docs/KNOWLEDGE.md.
5. From now on every deploy bumps the version and adds a CHANGELOG.md entry with two audit PASS ids and the previous deploy's rollback id.
6. Fill the previous-deploy rollback id for the live deploy (unknown today).
