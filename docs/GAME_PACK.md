# The game pack (spec 100, package C3)

A small set of files that are the SAME in every game's console page. They hold no game rules. The console repo keeps the one source in `packages/game-pack/`; `node tools/vendor-pack.mjs --game <game worktree>` copies it byte for byte into `<game>/apps/web/public/pack/` with a hash list, and `--check` (and `tests/game-pack.test.ts`) fails if a game's copy differs by one byte.

| File | What it is |
|---|---|
| `runbar.js` | The live control bar of Step 9 (Game day): one sentence of status, ONE big primary button (Start / Pause / Resume), small buttons (Add 30 more minutes, End the game with a Yes/No, Message to everyone with six ready messages or one line of 160 letters, Big screen, Board page), a people line, the PAUSED banner, prizes won with a "Prize given" tick, Download results, What changed, Game log. A button exists only if the game says it can do it. |
| `confirm.js` | The one Yes / No panel used instead of the browser's confirm() box. |
| `polish.js` | `window.__ctDirty` (unsaved work), the 40 second time-out sentence, the e-mail at the top. |
| `gamelog.html`, `gamelog.js` | The printable Game log: time + one sentence + seat number only. |
| `pack.css` | Styles for the above, light and dark. |

Each game adds ONE small file, `live-game.js`, that tells the pack what the game can do (`can`, `do`, `links`), what to say (`story`, counts) and, for the log page, `window.CTLogLoad`. Changing the pack: edit it in the console repo, run its tests, then run `vendor-pack` for each game inside that game's own package (never edit the copy).
