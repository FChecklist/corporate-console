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
$("f").addEventListener("submit", async (e) => {
  e.preventDefault(); $("msg").textContent = "One moment.";
  try {
    const res = await ask("/stats/games");
    if (res.status === 401) { $("msg").textContent = "That key is not right."; $("out").replaceChildren(); return; }
    if (!res.ok) { $("msg").textContent = "The numbers could not be read just now. Try again."; return; }
    draw(await res.json()); $("msg").textContent = "";
  } catch { $("msg").textContent = "The numbers could not be read just now. Try again."; }
});
$("csv").addEventListener("click", async () => {
  try {
    const res = await ask("/stats/games.csv");
    if (!res.ok) { $("msg").textContent = res.status === 401 ? "That key is not right." : "The file could not be made just now."; return; }
    const url = URL.createObjectURL(await res.blob()), a = el("a"); a.href = url; a.download = "funnel-games.csv"; a.click(); URL.revokeObjectURL(url);
  } catch { $("msg").textContent = "The file could not be made just now."; }
});
