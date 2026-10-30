// The version and the release time, on EVERY page of the console (the owner's rule): "Version 0.1.0, released 29 Oct 2026, 16:15 IST".
// One small footer at the end of the page, outside the screens, so a screen change never removes it. Each page's own script calls showVersion().
export const versionText = (v) => (v && v.version && v.releasedAtIST ? `Version ${v.version}, released ${String(v.releasedAtIST).replace(/^(\d+ \w+ \d+), /, "$1, ")}` : "");

export async function showVersion(doc = document, fetchFn = (u) => fetch(u)) {
  let line = doc.getElementById("version-line");
  if (!line) { line = doc.createElement("p"); line.id = "version-line"; line.className = "versionline"; doc.body.append(line); }
  try { const text = versionText(await (await fetchFn("/version.json")).json()); if (text) line.textContent = text; } catch { /* the line stays empty: the page works without it */ }
  return line;
}
