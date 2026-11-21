// The version and the release time, on EVERY page of the console (the owner's rule): "Version 0.2.2, released 21 Nov 2026, 10:00 IST".
// Footer standard (20 Nov 2026): one small footer at the end of the page, outside the screens, so a screen change never removes it:
//   line 1  Version X.Y.Z, released ... (the exact owner wording)
//   line 2  vX.Y.Z "what's new" (links to /changes) and "Cookie choices" (opens the cookie banner) and the help address.
// Each page's own script calls showVersion().
export const versionText = (v) => (v && v.version && v.releasedAtIST ? `Version ${v.version}, released ${String(v.releasedAtIST).replace(/^(\d+ \w+ \d+), /, "$1, ")}` : "");
export const HELP_EMAIL = "hello@corporatetambola.com";

/** the second footer line: what's new, cookie choices, help. `version` may be empty (the page then says only "What's new"). */
export function footerLinks(doc, version) {
  let p = doc.getElementById("footer-links");
  if (!p) { p = doc.createElement("p"); p.id = "footer-links"; p.className = "footerlinks"; doc.body.append(p); }
  while (p.firstChild) p.removeChild(p.firstChild);
  const a = doc.createElement("a"); a.href = "/changes"; a.id = "footer-changes"; a.textContent = version ? `v${version}: what's new` : "What's new";
  const b = doc.createElement("button"); b.type = "button"; b.id = "footer-cookies"; b.className = "link"; b.textContent = "Cookie choices";
  b.addEventListener("click", () => { const w = doc.defaultView; if (w && w.dispatchEvent) w.dispatchEvent(new w.CustomEvent("cg-cookie-choices")); });
  const h = doc.createElement("a"); h.href = "mailto:" + HELP_EMAIL; h.id = "footer-help"; h.textContent = "Need help? " + HELP_EMAIL;
  p.append(a, " · ", b, " · ", h);
  return p;
}

function ensureFooterStyles(doc) {
  if (doc.querySelector("link[data-footer-css]") || !doc.head) return;
  const l = doc.createElement("link"); l.rel = "stylesheet"; l.setAttribute("data-footer-css", "1");
  try { l.href = new URL("./footer.css", import.meta.url).pathname; } catch { l.href = "/core/footer.css"; }
  doc.head.append(l);
}

export async function showVersion(doc = document, fetchFn = (u) => fetch(u)) {
  ensureFooterStyles(doc);
  let line = doc.getElementById("version-line");
  if (!line) { line = doc.createElement("p"); line.id = "version-line"; line.className = "versionline"; doc.body.append(line); }
  let v = null;
  try { v = await (await fetchFn("/version.json")).json(); const text = versionText(v); if (text) line.textContent = text; } catch { /* the line stays empty: the page works without it */ }
  footerLinks(doc, v && /^\d+\.\d+\.\d+$/.test(String(v.version || "")) ? v.version : "");
  return line;
}
