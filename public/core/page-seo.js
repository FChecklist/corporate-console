// What search engines and AI crawlers are told by the console app itself (0.3.0).
// The app lives at one address ("/") and its screens are #/ routes. The first page a visitor sees, signed out, is public and may be indexed (its head says so).
// Once someone is SIGNED IN, every screen shows personal things (games, billing, account): the page then says noindex,nofollow and carries a title of its own, so no signed-in screen
// can be kept in a search result or an AI summary. Signing out puts the public head back. No inline script, no storage.
export const SCREEN_TITLES = { home: "Home", mygames: "My games", create: "Create a new game", control: "Control room", billing: "Billing", account: "Account", view: "Player's screen view" };
export const SITE = "Corporate Games console";

/** the title of the screen for a route like "mygames" or "create/from" */
export const titleFor = (route) => { const first = String(route || "home").replace(/^#?\/?/, "").split("/")[0] || "home"; return `${SCREEN_TITLES[first] || SCREEN_TITLES.home}: ${SITE}`; };

/** sets the robots meta and the title for what is on the page now. `opts`: { signedIn, route }. Returns the robots text now in force. */
export function setPageSeo(doc, opts = {}) {
  if (!doc || !doc.head) return "";
  const head = doc.head;
  let m = head.querySelector('meta[name="robots"]');
  if (!m) { m = doc.createElement("meta"); m.setAttribute("name", "robots"); head.append(m); }
  if (!doc.documentElement.hasAttribute("data-public-title")) { doc.documentElement.setAttribute("data-public-title", doc.title || ""); doc.documentElement.setAttribute("data-public-robots", m.getAttribute("content") || ""); } // the public head, remembered once
  if (opts.signedIn) { m.setAttribute("content", "noindex,nofollow"); doc.title = titleFor(opts.route); }
  else { const pub = doc.documentElement.getAttribute("data-public-robots"); if (pub) m.setAttribute("content", pub); else m.remove(); const t = doc.documentElement.getAttribute("data-public-title"); if (t) doc.title = t; }
  return m.isConnected ? m.getAttribute("content") || "" : "";
}
