// Mission Control (owner only, read only). The owner password is typed here and kept in this page's memory only: it is never stored on the device and never put in an address.
// Every text is drawn with textContent. Every call goes to this console's own /api/control/* (the same data the AI reads with its own key).
const LIGHTS = { green: "Green", amber: "Amber", red: "Red" };
const GONE = { not_available: "Not available on this game.", refused: "This game did not accept the owner password.", unreachable: "This game did not answer just now." };

const el = (doc, tag, text, cls) => { const n = doc.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
const rs = (minor, cur) => { const v = Number(minor || 0) / 100; return (cur && cur !== "INR" ? cur + " " : "Rs ") + v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
const secs = (ms) => (ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s");
const when = (ms) => { const d = new Date(Number(ms) + 19_800_000); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace("T", ", ") + " IST" : ""; };

export function start(doc = document, fetchFn = (...a) => fetch(...a)) {
  const $ = (id) => doc.getElementById(id);
  const E = (tag, text, cls) => el(doc, tag, text, cls);
  let key = "", current = "overview"; const cache = new Map();
  const ask = async (path, init = {}) => {
    const res = await fetchFn(path, { ...init, headers: { ...(init.headers || {}), "x-organizer": key }, cache: "no-store", credentials: "omit" });
    if (res.status === 404) { const e = new Error("refused"); e.refused = true; throw e; }
    if (!res.ok) throw new Error("status " + res.status);
    return res.json();
  };

  // ---- small builders
  const card = (title) => { const s = E("section", undefined, "mc-card"); if (title) s.append(E("h2", title)); return s; };
  const table = (head, rows, numeric = []) => {
    const w = E("div"); w.style.overflowX = "auto";
    const t = E("table"), h = E("tr"); head.forEach((c, i) => h.append(Object.assign(E("th", c, numeric.includes(i) ? "n" : ""))));
    t.append(h);
    for (const r of rows) { const tr = E("tr"); r.forEach((c, i) => tr.append(E("td", c ?? "", numeric.includes(i) ? "n" : ""))); t.append(tr); }
    w.append(t); return w;
  };
  const light = (l) => E("span", LIGHTS[l] || l, "mc-light " + l);
  const dl = (pairs) => { const d = E("dl"); for (const [k, v] of pairs) { d.append(E("dt", k)); const dd = E("dd"); if (v !== null && typeof v === "object") dd.append(v); else dd.textContent = v === null || v === undefined || v === "" ? "-" : String(v); d.append(dd); } return d; };
  const panelOr = (p, ok) => (p && p.state === "ok" ? ok(p.data) : E("span", GONE[p?.state] || "Not available.", "gone"));
  const txt = (p, ok) => (p && p.state === "ok" ? ok(p.data) : GONE[p?.state] || "Not available.");
  const apiNote = (path) => E("p", "The AI reads this same view at " + path + " with its own read key.", "note");

  // ---- Overview
  function overviewView(d) {
    const s = card("Overview");
    const c = d.counts, bad = c.red + c.amber;
    s.append(E("p", bad === 0 ? "Everything looks fine: " + c.green + " green." : c.red + " red, " + c.amber + " amber, " + c.green + " green. Start with the red ones.", "mc-summary"));
    const ul = E("ul", undefined, "mc-lines");
    for (const l of d.lines) { const li = E("li", undefined, "mc-line " + l.light); li.append(light(l.light)); const t = E("div"); t.append(E("b", l.name), E("span", l.reason, "why")); li.append(t); ul.append(li); }
    s.append(ul, apiNote("/api/control/overview"));
    return [s];
  }

  // ---- Games
  function oneGame(d) {
    const p = d.panels, det = E("details"), sm = E("summary");
    const state = p.health.state !== "ok" ? "red" : p.health.data.ok && !p.health.data.off ? "green" : "red";
    sm.append(light(state), E("span", d.game.name));
    if (p.version.state === "ok") sm.append(E("span", (p.version.data.version ? "version " + p.version.data.version + ", " : "") + "commit " + p.version.data.commit, "small"));
    det.append(sm);
    const v = p.visits.state === "ok" ? p.visits.data : null;
    det.append(dl([
      ["Live address", d.game.live],
      ["Mode", panelOr(p.mode, (m) => m === "LIVE" ? "LIVE (payments are real)" : m + " (payments are not real)")],
      ["Site switch", panelOr(p.site, (s) => s.off ? "Switched off since " + s.since + (s.note ? " (" + s.note + ")" : "") : "On")],
      ["Errors", panelOr(p.errors, (e) => e.lastHour + " in the last hour (alarm at " + e.threshold + "); " + e.hours.reduce((a, h) => a + h.errors, 0) + " in the last day")],
      ["24-hour deletion", panelOr(p.health, (h) => h.overduePurge ? h.overduePurge + " game(s) late, oldest waited " + h.overdueHours + " hours" : "Nothing late")],
      ["Visitors", panelOr(p.visits, (x) => x.humans ? x.humans.visitors + " visitors, " + x.humans.sessions + " visits, " + x.humans.returningVisitors + " came back" + (x.bots ? "; " + x.bots.sessions + " visits by robots" : "") : "-")],
      ["Where visitors come from", v ? v.sources.map((s) => s.k + " " + s.n).join(", ") || "-" : panelOr(p.visits, () => "")],
      ["Pages visited most", v ? v.landing.map((s) => s.k + " " + s.n).join(", ") || "-" : panelOr(p.visits, () => "")],
      ["Steps people reach", panelOr(p.funnel, (f) => f.on === false ? "Step counting is switched off on this game" : f.steps.map((s) => s.step + " " + s.count).join(", ") || "-")],
      ["Mail problems", panelOr(p.mail, (m) => "bounced " + (m.counts.bounced || 0) + ", complaints " + (m.counts.complained || 0) + ", delivered " + (m.counts.delivered || 0) + "; mail reports " + (m.webhook || "unknown"))],
      ["Data requests", panelOr(p.dataRequests, (r) => r.open + " open" + (r.overdue ? ", " + r.overdue + " late" : "") + ", " + r.done + " closed")],
      ["Latest release", panelOr(p.releases, (r) => r.current ? (r.current.version || "") + " (" + (r.current.date || "") + "): " + (r.current.title || "") : "-")],
      ["Games kept", panelOr(p.gamesKept, (g) => g.count + " game record(s)" + (g.newest ? ", newest " + when(g.newest) : ""))],
    ]));
    return det;
  }
  async function gamesView() {
    const ids = (await ask("/api/control/games")).games;
    const parts = await Promise.all(ids.map((g) => ask("/api/control/game?id=" + encodeURIComponent(g.id)).catch(() => null)));
    const s = card("Games");
    s.append(E("p", "Open a game to see everything it can tell. A line that says not available means that game does not have it yet.", "note"));
    parts.forEach((d, i) => { if (d) s.append(oneGame(d)); else s.append(E("p", ids[i].name + " could not be read just now.", "gone")); });
    const tool = E("form", undefined, "mc-tool"); const sel = E("select"); sel.id = "mc-og"; for (const g of ids) { const o = E("option", g.name); o.value = g.id; sel.append(o); }
    const em = E("input"); em.type = "email"; em.id = "mc-oe"; em.autocomplete = "off"; em.required = true;
    const lab1 = E("label", "Game "), lab2 = E("label", "Organizer's e-mail address "); lab1.append(sel); lab2.append(em);
    const go = E("button", "Look up", "btn"); go.type = "submit"; tool.append(lab1, lab2, go);
    const out = E("div", undefined, "small"); out.id = "mc-oout";
    tool.addEventListener("submit", async (e) => {
      e.preventDefault(); out.replaceChildren(E("p", "One moment."));
      try {
        const r = await ask("/api/control/organizer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: sel.value, email: em.value }) });
        if (r.state === "not_available") out.replaceChildren(E("p", "This game cannot look up an organizer.", "gone"));
        else if (!r.found) out.replaceChildren(E("p", "No organizer was found for " + r.email + " on this game."));
        else out.replaceChildren(E("p", r.email + ": " + r.games.length + " game(s). Mail problems: " + r.mailProblems + "."), table(["Game", "State", "Starts", "Paid"], r.games.map((x) => [x.id, x.state, x.start, x.paid ? "yes" : "no"])));
      } catch { out.replaceChildren(E("p", "The lookup could not be done just now.", "gone")); }
      em.value = "";
    });
    const lk = card("Organizer lookup"); lk.append(E("p", "Read only. The address is shown hidden and is not kept anywhere.", "note"), tool, out);
    return [s, lk, apiNote("/api/control/game?id=<game>")];
  }

  // ---- Websites and pages
  async function websitesView() {
    const sites = (await ask("/api/control/websites")).sites;
    const parts = await Promise.all(sites.map((s) => ask("/api/control/websites?site=" + encodeURIComponent(s.id)).catch(() => null)));
    const out = [];
    parts.forEach((d, i) => {
      const s = card(sites[i].name);
      if (!d) { s.append(E("p", "Could not be checked just now.", "gone")); out.push(s); return; }
      s.append(E("p", "Rule: " + d.site.rule + ". " + d.counts.green + " green, " + d.counts.amber + " amber, " + d.counts.red + " red.", "note"));
      s.append(table(["Page", "Answer", "Speed", "Search engines", "Result"], d.pages.map((p) => [p.path, p.status || "none", secs(p.ms), p.robots ? (p.robots.noindex ? "hidden" : "listed") : "-", LIGHTS[p.light] + ": " + p.note]), [1, 2]));
      if (d.siteMap) s.append(E("p", "Site map lists " + d.siteMap.urls + " pages.", "note"));
      out.push(s);
    });
    out.push(apiNote("/api/control/websites?site=<id>"));
    return out;
  }

  // ---- Payments
  async function paymentsView(month) {
    const d = await ask("/api/control/payments" + (month ? "?month=" + encodeURIComponent(month) : ""));
    const s = card("Payments, " + d.month), t = d.total;
    const tool = E("form", undefined, "mc-tool"); const m = E("input"); m.type = "month"; m.id = "mc-month"; m.value = d.month; const lab = E("label", "Month "); lab.append(m);
    const b = E("button", "Show", "btn"); b.type = "submit"; tool.append(lab, b);
    tool.addEventListener("submit", (e) => { e.preventDefault(); if (m.value) { cache.delete("payments"); show("payments", m.value); } });
    s.append(tool, E("p", d.currencyNote, "note"));
    s.append(E("p", "Real money, all games: paid " + t.paid + " (" + rs(t.paidMinor) + "), waiting to be paid " + t.waiting + " (" + rs(t.waitingMinor) + "), failed " + t.failed + ", refunded " + rs(t.refundsMinor) + ", gateway fees " + rs(t.feeMinor) + ".", "mc-summary"));
    s.append(E("p", "Test payments (not real money, kept apart): paid " + t.testPaid + ", waiting " + t.testWaiting + ", failed " + t.testFailed + ".", "note"));
    const rows = d.games.map((g) => g.state === "ok" ? [g.name, g.real.paid, rs(g.real.paidMinor, g.currency), g.real.waiting, g.real.failed, rs(g.refunds.minor, g.currency), g.test.paid + g.test.waiting + g.test.failed] : [g.name, GONE[g.state] || "Not available.", "", "", "", "", ""]);
    s.append(table(["Game", "Paid", "Paid amount", "Waiting", "Failed", "Refunded", "Test payments"], rows, [1, 2, 3, 4, 5, 6]));
    const out = [s];
    const rc = card("Last receipts and payments waiting");
    const lr = d.games.filter((g) => g.state === "ok").flatMap((g) => g.lastReceipts.map((r) => [g.name, r.whenIST || "", r.txn, rs(r.minor, r.currency), r.method || "", r.organisation || ""]));
    rc.append(E("h3", "Paid"), lr.length ? table(["Game", "When", "Receipt", "Amount", "Method", "Organisation"], lr, [3]) : E("p", "No paid receipts in this month.", "gone"));
    const wn = d.games.filter((g) => g.state === "ok").flatMap((g) => g.waitingNow.map((r) => [g.name, r.txn, rs(r.minor, r.currency), r.organisation || ""]));
    rc.append(E("h3", "Waiting to be paid"), wn.length ? table(["Game", "Receipt", "Amount", "Organisation"], wn, [2]) : E("p", "Nothing is waiting.", "gone"));
    const lt = d.games.filter((g) => g.state === "ok").flatMap((g) => g.lastTests.map((r) => [g.name, r.txn, "Test payment (not real money)", rs(r.minor, r.currency), r.status]));
    rc.append(E("h3", "Test payments"), lt.length ? table(["Game", "Receipt", "Kind", "Amount", "State"], lt, [3]) : E("p", "No test payments in this month.", "gone"));
    out.push(rc);
    const c = d.central, cc = card("Central payment site");
    cc.append(E("p", c.state === "ok" ? "Connected. Entries that do not match: " + c.issues + (c.issues === 0 ? " (good)." : " (look at these)." ) : c.state === "not_connected" ? c.note : "The central payment site could not be read just now.", c.state === "ok" ? "" : "note"));
    out.push(cc, apiNote("/api/control/payments?month=YYYY-MM"));
    return out;
  }

  // ---- Logs and errors
  async function logsView() {
    const d = await ask("/api/control/logs"), x = d.summary;
    const s = card("Logs and errors");
    s.append(E("p", x.errors24h + " errors in the last day (" + x.lastHour + " in the last hour); mail problems " + x.mailProblems + "; data requests open " + x.openRequests + ", late " + x.overdueRequests + ".", "mc-summary"), E("p", d.note, "note"));
    const rows = d.games.map((g) => [g.name, txt(g.errors, (e) => e.lastHour + " now, " + e.hours.reduce((a, h) => a + h.errors, 0) + " in a day"), txt(g.mail, (m) => "bounced " + (m.counts.bounced || 0) + ", complaints " + (m.counts.complained || 0)), txt(g.dataRequests, (r) => r.open + " open, " + r.overdue + " late")]);
    s.append(table(["Game", "Errors", "Mail", "Data requests"], rows));
    const out = [s];
    for (const g of d.games) {
      const c = card(g.name + ": errors by hour and latest mail events");
      c.append(panelOr(g.errors, (e) => e.hours.length ? table(["Hour (UTC)", "Errors"], e.hours.map((h) => [h.hour, h.errors]), [1]) : E("p", "No errors recorded.", "gone")));
      c.append(panelOr(g.mail, (m) => m.latest.length ? table(["When", "Event", "To", "Detail"], m.latest.map((e) => [e.at, e.event, e.to, e.detail || ""])) : E("p", "No mail events.", "gone")));
      out.push(c);
    }
    out.push(apiNote("/api/control/logs"));
    return out;
  }

  // ---- Releases and history
  async function releasesView() {
    const d = await ask("/api/control/releases");
    const s = card("Live versions");
    s.append(table(["Game", "Version", "Commit", "Built", "Release notes kept"], d.games.map((g) => [g.name, g.version?.version || "-", g.version ? g.version.commit + (g.version.dirty ? " (dirty build)" : "") : "-", g.version?.builtAt || "-", txt(g.notes, (n) => n.count + " (latest: " + (n.latest[0]?.title || "-") + ")")])));
    const out = [s];
    const cf = card("Cloudflare deployments and rollback ids");
    if (d.cloudflare.state !== "ok") cf.append(E("p", d.cloudflare.note, "note"));
    else for (const p of d.cloudflare.projects) {
      cf.append(E("h3", p.name + (p.rollbackId ? "  -  rollback id " + p.rollbackId : "")));
      cf.append(p.state === "ok" ? table(["Deployment", "When", "Commit", "State", ""], p.deployments.map((x) => [x.short, x.createdIST || "", x.commit || "-", (x.environment || "") + " " + (x.status || ""), x.live ? "LIVE" : ""])) : E("p", GONE[p.state] || "Not available.", "gone"));
    }
    out.push(cf);
    const log = card("Release log");
    log.append(E("p", "Copied from the release handover (section 10) on " + (d.releaseLog.mirroredAt || "").slice(0, 10) + ".", "note"), table(["When (IST)", "Site", "Change", "Rollback id", "New deployment", "What happened"], d.releaseLog.entries.map((e) => [e.day + " " + e.time, e.site, e.from ? e.from + " to " + e.to : "-", e.rollback ? e.rollback.slice(0, 8) : "-", e.deployment ? e.deployment.slice(0, 8) : "-", e.text.slice(0, 160)])));
    out.push(log);
    const h = card("History of changes");
    if (d.history.state !== "ok") h.append(E("p", "The history table has not been created yet. Apply migration 0005 to the console database.", "note"));
    else if (!d.history.rows.length) h.append(E("p", "No history lines yet. A line is added after each release or change with tools/control-history.mjs.", "gone"));
    else h.append(table(["When", "Who", "Site", "What", "Result", "Id"], d.history.rows.map((r) => [r.atIST, r.who === "ai" ? "AI" : "Owner", r.site, r.what, r.result, r.ref || ""])));
    out.push(h, apiNote("/api/control/releases and /api/control/history"));
    return out;
  }

  const TABS = [["overview", "Overview", async () => overviewView(await ask("/api/control/overview"))], ["games", "Games", gamesView], ["websites", "Websites and pages", websitesView], ["payments", "Payments", (m) => paymentsView(m)], ["logs", "Logs and errors", logsView], ["releases", "Releases and history", releasesView]];
  async function show(id, arg) {
    current = id;
    for (const b of $("mc-tabs").children) b.setAttribute("aria-selected", String(b.dataset.tab === id));
    const panel = $("mc-panel"); panel.replaceChildren(E("p", "One moment.", "line"));
    try {
      let nodes = cache.get(id);
      if (!nodes) { nodes = await TABS.find((t) => t[0] === id)[2](arg); cache.set(id, nodes); }
      if (current !== id) return;
      panel.replaceChildren(...nodes);
      $("mc-stamp").textContent = "Read " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      if (current !== id) return;
      if (e.refused) { lock("The password is no longer accepted."); return; }
      const retry = E("button", "Try again", "btn"); retry.type = "button"; retry.addEventListener("click", () => show(id, arg));
      panel.replaceChildren(E("p", "Mission Control could not read this just now.", "line"), retry);
    }
  }
  function lock(msg) { key = ""; cache.clear(); $("mc-app").hidden = true; $("mc-form").hidden = false; $("mc-key").value = ""; $("mc-msg").textContent = msg || ""; }

  for (const [id, label] of TABS) { const b = E("button", label); b.type = "button"; b.dataset.tab = id; b.setAttribute("role", "tab"); b.addEventListener("click", () => show(id)); $("mc-tabs").append(b); }
  $("mc-refresh").addEventListener("click", () => { cache.clear(); show(current); });
  $("mc-lock").addEventListener("click", () => lock("The password was forgotten. Type it again to open."));
  $("mc-form").addEventListener("submit", async (e) => {
    e.preventDefault(); key = $("mc-key").value.trim(); $("mc-msg").textContent = "One moment.";
    try {
      await ask("/api/control/ping");
      $("mc-msg").textContent = ""; $("mc-form").hidden = true; $("mc-key").value = ""; $("mc-app").hidden = false;
      show("overview");
    } catch (err) { key = ""; $("mc-msg").textContent = err.refused ? "That password was not accepted. Please check it and try again." : "Mission Control could not be reached just now. Please try again."; }
  });
  return { show, lock };
}

if (typeof document !== "undefined" && document.getElementById("mc-form") && !globalThis.__MC_NO_AUTOSTART) start(document);
