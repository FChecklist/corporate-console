// The version and the release time, on EVERY page of the console (the owner's rule): "Version 0.1.0, released 29 Oct 2026, 16:15 IST".
// One small footer at the end of the page, outside the screens, so a screen change never removes it. Each page's own script calls showVersion().
export const versionText = (v) => (v && v.version && v.releasedAtIST ? `Version ${v.version}, released ${String(v.releasedAtIST).replace(/^(\d+ \w+ \d+), /, "$1, ")}` : "");

/** our other live products, as one quiet line above the version line (the same line is in the footer of every Corporate Tambola game and of the home site) */
export const MORE_FROM_US = [["VERIDIAN DPDP", "https://dpdp.veridian-aios.com/"], ["VERIDIAN", "https://veridian-aios.com/"], ["Townhall Records", "https://townhall-records.com/"]];
export function showMoreLine(doc = document, before = null) {
  let p = doc.getElementById("more-line");
  if (p) return p;
  p = doc.createElement("p"); p.id = "more-line"; p.className = "versionline"; p.append("More from us: ");
  MORE_FROM_US.forEach(([name, href], i) => {
    const a = doc.createElement("a"); a.href = href; a.rel = "noopener"; a.textContent = name; p.append(a);
    p.append(i < MORE_FROM_US.length - 2 ? ", " : i === MORE_FROM_US.length - 2 ? " and " : ".");
  });
  if (before) before.before(p); else doc.body.append(p);
  return p;
}

export async function showVersion(doc = document, fetchFn = (u) => fetch(u)) {
  let line = doc.getElementById("version-line");
  if (!line) { line = doc.createElement("p"); line.id = "version-line"; line.className = "versionline"; doc.body.append(line); }
  showMoreLine(doc, line);
  try { const text = versionText(await (await fetchFn("/version.json")).json()); if (text) line.textContent = text; } catch { /* the line stays empty: the page works without it */ }
  return line;
}
