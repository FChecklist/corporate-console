// Owner-only funnel page: GET /stats/games (header x-owner-key). Draws everything with textContent. The key stays in this page only, nothing is stored on the device.
import { showVersion } from "/core/version.js";
import { GAMES } from "/core/games.config.js";
showVersion(); // the version and release time on this page too
const $ = (id) => document.getElementById(id);
const names = Object.fromEntries(GAMES.map((g) => [g.id, g.name]));
const STATE = { connected: "Connected to the game", console: "Counted by the console", "not-connected": "Not connected yet" };
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const label = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const iso = (d) => d.toISOString().slice(0, 10);
$("to").value = iso(new Date()); $("from").value = iso(new Date(Date.now() - 29 * 86400000));
const q = () => new URLSearchParams({ from: $("from").value, to: $("to").value }).toString();
const ask = (path) => fetch(path + "?" + q(), { headers: { "x-owner-key": $("key").value.trim() }, cache: "no-store", credentials: "omit" });

function draw(r) {
  const out = $("out"); out.replaceChildren();
  for (const g of r.games) {
    const s = el("section"); s.className = "g-" + g.game;
    s.append(el("h2", names[g.game] || g.game), el("p", STATE[g.state] || "", "note"));
    if (g.state === "not-connected") { out.append(s); continue; }
    const days = g.days.slice().sort((a, b) => (a.day < b.day ? -1 : 1));
    const t = el("table"), head = el("tr");
    for (const h of ["Step", "Total", ...days.map((d) => d.day)]) head.append(el("th", h));
    t.append(head);
    for (const step of r.steps) {
      const tr = el("tr"); tr.append(el("td", label(step)), el("td", String(g.total[step] ?? 0)));
      for (const d of days) tr.append(el("td", String(d.counts[step] ?? 0)));
      t.append(tr);
    }
    s.append(t); out.append(s);
  }
}
const wrong = (id, text) => { const e = $(id + "-err"); e.textContent = text; e.classList.toggle("hide", !text); };
/** the two checks every press makes first; true = fine. Each problem is said right under its own field. */
function valid() {
  wrong("key", ""); wrong("range", ""); $("msg").textContent = "";
  if (!$("key").value.trim()) { wrong("key", "Please paste the owner key first, then press Show."); $("key").focus(); return false; }
  if (!$("from").value || !$("to").value) { wrong("range", "Please pick both days, for example 1 Nov 2026 and 30 Nov 2026."); return false; }
  if ($("from").value > $("to").value) { wrong("range", "The \"From\" day must not be after the \"To\" day. Please swap them."); return false; }
  return true;
}
let busy = false; // one press asks once
$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || !valid()) return;
  busy = true; $("show").disabled = true; $("msg").textContent = "One moment.";
  try {
    const res = await ask("/stats/games");
    if (res.status === 401) { $("msg").textContent = ""; wrong("key", "That key is not right. Please paste it again, or ask the owner for it."); $("out").replaceChildren(); return; }
    if (!res.ok) { $("msg").textContent = "The numbers could not be read just now. Press Show to try again."; return; }
    draw(await res.json()); $("msg").textContent = "";
  } catch { $("msg").textContent = "The numbers could not be read just now. Press Show to try again."; }
  finally { busy = false; $("show").disabled = false; }
});
$("csv").addEventListener("click", async () => {
  if (busy || !valid()) return;
  busy = true; $("csv").disabled = true;
  try {
    const res = await ask("/stats/games.csv");
    if (!res.ok) { if (res.status === 401) wrong("key", "That key is not right. Please paste it again, or ask the owner for it."); else $("msg").textContent = "The file could not be made just now. Press Download CSV to try again."; return; }
    const url = URL.createObjectURL(await res.blob()), a = el("a"); a.href = url; a.download = "funnel-games.csv"; a.click(); URL.revokeObjectURL(url);
  } catch { $("msg").textContent = "The file could not be made just now. Press Download CSV to try again."; }
  finally { busy = false; $("csv").disabled = false; }
});
