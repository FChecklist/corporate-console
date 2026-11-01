// Owner-only visitor page: GET /stats/visits (header x-owner-key). Draws everything with textContent. The key stays in this page only, nothing is stored on the device.
import { showVersion } from "/core/version.js";
import { GAMES } from "/core/games.config.js";
showVersion();
const $ = (id) => document.getElementById(id);
const names = Object.fromEntries(GAMES.map((g) => [g.id, g.name]));
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const iso = (d) => d.toISOString().slice(0, 10);
$("to").value = iso(new Date()); $("from").value = iso(new Date(Date.now() - 29 * 86400000));
const q = () => new URLSearchParams({ from: $("from").value, to: $("to").value }).toString();
const ask = (path) => fetch(path + "?" + q(), { headers: { "x-owner-key": $("key").value.trim() }, cache: "no-store", credentials: "omit" });
const table = (title, head, rows) => {
  const s = el("section"); s.append(el("h2", title));
  if (!rows.length) { s.append(el("p", "Nothing yet.", "note")); return s; }
  const t = el("table"), h = el("tr"); for (const c of head) h.append(el("th", c)); t.append(h);
  for (const r of rows) { const tr = el("tr"); for (const c of r) tr.append(el("td", String(c ?? ""))); t.append(tr); }
  s.append(t); return s;
};
const secs = (ms) => (ms == null ? "" : ms >= 60000 ? Math.floor(ms / 60000) + " min " + Math.round((ms % 60000) / 1000) + " s" : Math.round(ms / 1000) + " s");
function draw(r) {
  const out = $("out"); out.replaceChildren();
  const top = el("section"); top.append(el("h2", "Now and in this period"), el("p", `On the sites right now: ${r.live}. Visitors: ${r.visitors}. Page views: ${r.pageViews}.`));
  out.append(top,
    table("Per site", ["Site", "Visitors", "Page views"], r.games.map((g) => [names[g.game] || g.game, g.visitors, g.views])),
    table("Pages", ["Site", "Page", "Views", "Visitors", "Average time", "Average scroll %"], r.pages.map((p) => [names[p.game] || p.game, p.path, p.views, p.visitors, secs(p.avgMs), p.avgScroll ?? ""])),
    table("Where visitors come from", ["Source", "Visitors"], r.sources.map((x) => [x.source, x.visitors])),
    table("Devices", ["Device", "Visitors"], r.devices.map((x) => [x.device, x.visitors])),
    table("Browsers", ["Browser", "Visitors"], r.browsers.map((x) => [x.browser, x.visitors])),
    table("Countries", ["Country", "Visitors"], r.countries.map((x) => [x.country, x.visitors])),
    table("Languages", ["Language", "Visitors"], r.languages.map((x) => [x.lang, x.visitors])),
    table("Presses, shares and copies", ["Site", "What", "Pressed", "Times"], r.presses.map((p) => [names[p.game] || p.game, p.kind, p.target, p.n])));
}
$("f").addEventListener("submit", async (e) => {
  e.preventDefault(); $("msg").textContent = "One moment.";
  try {
    const res = await ask("/stats/visits");
    if (res.status === 401) { $("msg").textContent = "Please check the key and try again."; $("out").replaceChildren(); return; }
    if (!res.ok) { $("msg").textContent = "The numbers could not be read just now. Try again."; return; }
    draw(await res.json()); $("msg").textContent = "";
  } catch { $("msg").textContent = "The numbers could not be read just now. Try again."; }
});
$("csv").addEventListener("click", async () => {
  try {
    const res = await ask("/stats/visits.csv");
    if (!res.ok) { $("msg").textContent = res.status === 401 ? "Please check the key and try again." : "The file could not be made just now."; return; }
    const url = URL.createObjectURL(await res.blob()), a = el("a"); a.href = url; a.download = "visits.csv"; a.click(); URL.revokeObjectURL(url);
  } catch { $("msg").textContent = "The file could not be made just now."; }
});
