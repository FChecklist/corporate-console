"""Puts the master console bridge into one game repo (a git worktree of the game, never the live folder).

  python tools/game-port/port-bridge.py --game tictactoe --repo C:/ct/test-sites/tictactoe-console

It (1) copies the bridge and the contract kit (tools/vendor-bridge.mjs), (2) writes the game's console-adapter.ts from the Bingo one (the reference, already tested),
(3) patches worker.ts / pay.ts / signin.js / secrets list / migrations list with the same small edits as Bingo, (4) copies and adapts Bingo's tests.
Every edit is an exact-text replacement; if the text is not found it STOPS (the game differs: look at it by hand). Nothing is guessed.
"""
import argparse, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONSOLE = os.path.abspath(os.path.join(HERE, "..", ".."))
BINGO = r"C:\ct\test-sites\bingo-console"

GAMES = {
    "tambola": dict(id="tambola", name="Corporate Tambola", keep_demo_cap=True, free_expr="DEMO_CAP", free_expr_num=10, base_cap=10, call=12, pay_import_extra="", prefix=("ctk_", "cth_", "ctc_"), cors_tail='x-ct-vid, x-ct-vs"', secrets_after="PAY_HOP_URL"),
    "tictactoe": dict(id="tictactoe", name="Corporate Tic Tac Toe", free_import='', free_expr='FREE_GAME_CAP', pay_import_extra=', FREE_GAME_CAP', free_expr_num=10, base_cap=10, call=9, secrets_after="PAY_HOP_URL"),
    "snakesladders": dict(id="snakesladders", name="Corporate Snakes and Ladders", free_import='', free_expr='0', free_expr_num=0, base_cap=100, call=20, pay_import_extra='', secrets_after="PAY_HOP_URL"),
    "luckbychance": dict(id="luckbychance", name="Corporate Luck by Chance", free_import='', free_expr='0', free_expr_num=0, base_cap=100, call=20, pay_import_extra='', secrets_after="PAY_HOP_URL"),
}

def read(p):
    s = open(p, encoding="utf8", newline="").read()
    return s.replace("\r\n", "\n"), ("\r\n" if "\r\n" in s else "\n")

def write(p, s, nl):
    open(p, "w", encoding="utf8", newline="").write(s.replace("\n", nl))

def rep(s, old, new, what, count=1):
    if s.count(old) != count:
        sys.exit(f"STOP: {what}: expected {count} match(es) of the text below, found {s.count(old)}:\n{old[:200]}")
    return s.replace(old, new)

def pfx(g, i):
    return g.get("prefix", ("cbk_", "cbh_", "cbc_"))[i]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--game", required=True); ap.add_argument("--repo", required=True)
    a = ap.parse_args(); g = GAMES[a.game]; repo = a.repo
    src = os.path.join(repo, "apps", "edge", "src")
    # 1 vendor
    subprocess.check_call(["node", os.path.join(CONSOLE, "tools", "vendor-bridge.mjs"), "--game", repo])
    # 2 adapter from Bingo
    s, nl = read(os.path.join(BINGO, "apps", "edge", "src", "console-adapter.ts"))
    s = s.replace('"bingo"', f'"{g["id"]}"').replace("Corporate Bingo", g["name"])
    if not g.get("keep_demo_cap"):
        s = rep(s, 'import { DEMO_CAP } from "../../../packages/beacon/src/config";\n', "", "adapter import of DEMO_CAP")
    s = rep(s, 'const PREFIX = { master: "cbk_", host: "cbh_", cohost: "cbc_" } as const;', f'const PREFIX = {{ master: "{pfx(g,0)}", host: "{pfx(g,1)}", cohost: "{pfx(g,2)}" }} as const;', "adapter key prefixes")
    s = rep(s, "import { MAX_DRAFTS, sendMail, type PayEnv } from \"./pay\";", f"import {{ MAX_DRAFTS, sendMail, type PayEnv{g['pay_import_extra']} }} from \"./pay\";", "adapter pay import")
    s = rep(s, "const FREE_DEMO: number = DEMO_CAP;", f"const FREE_DEMO: number = {g['free_expr']};", "adapter free size")
    write(os.path.join(src, "console-adapter.ts"), s, nl)
    # 3 worker.ts
    p = os.path.join(src, "worker.ts"); w, nl = read(p)
    w = rep(w, 'import { PAY_SCHEMA, payRoute,', 'import { handleConsole } from "./console-bridge/bridge";\nimport { BRIDGE_SCHEMA } from "./console-bridge/schema";\nimport { consoleAdapter, CONSOLE_KEY_LABEL, keyGameEnded, scopedKeyMayCall } from "./console-adapter";\nimport { PAY_SCHEMA, payRoute,', "worker import")
    w = rep(w, '  GOOGLE_CLIENT_ID?: string;\n}', '  GOOGLE_CLIENT_ID?: string;\n  /** Master console (console-bridge/): the console\'s public signing keys as "k1:<key>,k2:<key>" (a plain setting, not a secret). Empty means the bridge is dark and every /api/console/ address answers 404. CONSOLE_ORIGIN: where invited helpers are sent to accept. */\n  CONSOLE_PUBKEYS?: string; CONSOLE_ORIGIN?: string;\n}', "worker Env")
    ct = g.get("cors_tail", 'x-cb-vid, x-cb-vs"')
    w = rep(w, ct, ct[:-1] + ', x-console-step"', "CORS")
    w = rep(w, '  ...GAME_RECORD_SCHEMA,\n];', '  ...GAME_RECORD_SCHEMA,\n  // the master console bridge (migration game_role): who may do what in one game by e-mail, assertion ids used, one-time hand-off links\n  ...BRIDGE_SCHEMA,\n];', "SCHEMA tail")
    w = rep(w, 'interface Auth { plat: boolean; org: string | null; kind: "platform" | "master" | "ai" | "host" | "cohost" | null; viaLink?: boolean; eid?: string | null;', 'interface Auth { plat: boolean; org: string | null; kind: "platform" | "master" | "ai" | "host" | "cohost" | null; viaLink?: boolean; eid?: string | null; /** a key made by the master console (label "console"): when it is tied to one game it works for that game only */ console?: boolean;', "Auth")
    w = rep(w, 'SELECT org, kind, eid, host_id, expires_ms FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)', 'SELECT org, kind, eid, host_id, expires_ms, label FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)', "authOfKey select")
    w = rep(w, 'host_id: string | null; expires_ms: number | null }>();\n  if (!row) return { plat: false, org: null, kind: null };\n  if (row.kind === "host") {', 'host_id: string | null; expires_ms: number | null; label: string | null }>();\n  if (!row) return { plat: false, org: null, kind: null };\n  if (row.label === CONSOLE_KEY_LABEL) { // a key made by the master console: no Host first-open setup (the console proved the mailbox); one tied to a game stops the moment that game is over\n    if (row.eid && (await keyGameEnded(env, row.eid, now))) return { plat: false, org: null, kind: null };\n    return { plat: false, org: row.org, kind: row.kind, eid: row.eid ?? null, console: true, ...(row.kind === "host" ? { hostReady: true } : {}) };\n  }\n  if (row.kind === "host") {', "authOfKey body")
    w = rep(w, 'const can = (a: Auth, e: { org: string | null }, master = false) => a.plat || (!!a.org && e.org === a.org && a.kind !== "cohost"', 'const can = (a: Auth, e: { org: string | null; id?: string }, master = false) => a.plat || (!!a.org && e.org === a.org && gameFits(a, e) && a.kind !== "cohost"', "can")
    w = rep(w, 'const canAi = (a: Auth, e: { org: string | null }) => a.plat || (!!a.org && e.org === a.org && (a.kind === "master"', 'const canAi = (a: Auth, e: { org: string | null; id?: string }) => a.plat || (!!a.org && e.org === a.org && gameFits(a, e) && (a.kind === "master"', "canAi")
    w = rep(w, 'const mayPay = (a: Auth, e: { id: string; org: string | null }) => !!a.org && e.org === a.org && !a.viaLink &&', 'const mayPay = (a: Auth, e: { id: string; org: string | null }) => !!a.org && e.org === a.org && gameFits(a, e) && !a.viaLink &&', "mayPay")
    w = rep(w, '/** May this caller act on this engagement? `master`', '/** A key made by the master console and tied to one game works for that game only (console-bridge/bridge.ts keyFitsGame). Every other key is unchanged. A game without an id fails closed. */\nconst gameFits = (a: Auth, e: { id?: string }) => !(a.console && a.eid) || a.eid === e.id;\n/** May this caller act on this engagement? `master`', "gameFits")
    w = rep(w, '/** The credit fields a caller who may pay sees', '/** The three rules above, for tests only (console-bridge.test.ts proves what a key tied to one game may and may not do). */\nexport const __authRules = { can, canAi, mayPay };\n/** The credit fields a caller who may pay sees', "__authRules")
    w = rep(w, 'async function route(req: Request, env: Env, now: number): Promise<Response> {\n  const a = await authOf(req, env, now);\n', 'async function route(req: Request, env: Env, now: number): Promise<Response> {\n  { const cr = await handleConsole(consoleAdapter(now), req, env); if (cr) return cr; } // the master console bridge: dark (null) unless CONSOLE_PUBKEYS is set\n  const a = await authOf(req, env, now);\n  if (a.console && a.eid && !scopedKeyMayCall(a.eid, req.method, new URL(req.url).pathname)) return json({ error: "This sign-in is for one game only. Open the console to see your other games." }, 403);\n', "route")
    write(p, w, nl)
    # pay.ts
    p = os.path.join(src, "pay.ts"); w, nl = read(p)
    w = rep(w, 'const k = await db.prepare("SELECT org, kind, eid FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)").bind(await sha("key|" + presented), now).first<{ org: string; kind: string; eid: string | null }>();', 'const k = await db.prepare("SELECT org, kind, eid, label FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)").bind(await sha("key|" + presented), now).first<{ org: string; kind: string; eid: string | null; label: string | null }>();', "pay select", 2)
    w = rep(w, '      if (k.kind === "cohost" && k.eid && k.eid !== b.eid) return json({ error: "Your Co-host link is for a different game." }, 403); // a Co-host belongs to one game\n', '      if (k.kind === "cohost" && k.eid && k.eid !== b.eid) return json({ error: "Your Co-host link is for a different game." }, 403); // a Co-host belongs to one game\n      if (k.label === "console" && k.eid && k.eid !== b.eid) return json({ error: "This sign-in is for one game only. Open the console to pay for your other games." }, 403); // a key made by the master console and tied to one game\n', "pay cohost line")
    w = rep(w, '(k.kind === "cohost" && k.eid && k.eid !== b.eid)) return json({ error: "Please sign in again." }, 403);', '((k.kind === "cohost" || k.label === "console") && k.eid && k.eid !== b.eid)) return json({ error: "Please sign in again." }, 403);', "pay second check")
    write(p, w, nl)
    # signin.js
    p = os.path.join(repo, "apps", "web", "public", "signin.js"); w, nl = read(p)
    bs, _ = read(os.path.join(BINGO, "apps", "web", "public", "signin.js"))
    w = rep(w, 't = q.get("t") || hs.t || "", go = (q.get("go") || hs.go) === "ai" ? "/ai-link.html" : "/zc.html";\n  try { history.replaceState({ t, go: go === "/ai-link.html" ? "ai" : "" }, "", location.pathname); } catch {}', re.search(r't = q\.get\("t"\) \|\| hs\.t[^\n]*\n[^\n]*\n[^\n]*\n  try \{ history\.replaceState[^\n]*', bs).group(0), "signin top")
    hand = bs[bs.index("  const handoff = async"):bs.index("  const draw = (msg) => {")].replace("Corporate Bingo", g["name"])
    w = rep(w, "  const draw = (msg) => {\n", hand + "  const draw = (msg) => {\n    if (consoleEid && t) return handoff();\n", "signin draw")
    write(p, w, nl)
    # secrets list + migrations list
    p = os.path.join(repo, "config", "SECRETS_NAMES.md"); w, nl = read(p)
    lines = w.split("\n"); i = max(k for k, l in enumerate(lines) if l.startswith("| `"))
    b, _ = read(os.path.join(BINGO, "config", "SECRETS_NAMES.md"))
    add = [l for l in b.split("\n") if l.startswith("| `CONSOLE_")]
    lines[i + 1:i + 1] = add; write(p, "\n".join(lines), nl)
    mig_dir = os.path.join(src, "..", "migrations"); nums = sorted(f for f in os.listdir(mig_dir) if re.match(r"\d{4}_", f))
    nxt = "%04d" % (int(nums[-1][:4]) + 1); mig = f"{nxt}_game_role.sql"
    bsql, _ = read(os.path.join(BINGO, "apps", "edge", "migrations", "0029_game_role.sql")); write(os.path.join(mig_dir, mig), bsql, "\n")
    print("migration written:", mig, "(add it to the FILES list of apps/edge/test/migrations.test.ts and its title)")
    # tests from Bingo
    t, nl = read(os.path.join(BINGO, "apps", "edge", "test", "console-bridge.test.ts"))
    t = t.replace("cbk_", pfx(g, 0))
    t = t.replace("const CALL_SECONDS = 9;", f"const CALL_SECONDS = {g['call']};")
    t = t.replace("const FREE = 10, BASE_CAP = 10;", f"const FREE = {g['free_expr_num']}, BASE_CAP = {g['base_cap']};")
    t = t.replace("Corporate Bingo", g["name"]).replace('"bingo"', f'"{g["id"]}"').replace("toBe(\"bingo\")", f'toBe("{g["id"]}")').replace("Bingo", g["name"].replace("Corporate ", ""))
    write(os.path.join(repo, "apps", "edge", "test", "console-bridge.test.ts"), t, nl)
    h, nl = read(os.path.join(BINGO, "apps", "web", "test", "console-handoff.test.ts")); h = h.replace("const CALL_SECONDS = 9, BASE_CAP = 10;", f"const CALL_SECONDS = {g['call']}, BASE_CAP = {g['base_cap']};"); write(os.path.join(repo, "apps", "web", "test", "console-handoff.test.ts"), h, nl)
    print("done: now run the tsc check and the two new test files, then look at what differs for this game")

main()
