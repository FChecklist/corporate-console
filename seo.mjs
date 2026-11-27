// Search and AI-search files for the console, made at build time (0.2.2). One place, so the title, description, canonical address, Open Graph tags,
// structured data (JSON-LD), sitemap, robots.txt and llms.txt can never disagree with each other or with config/games.json.
// Rules: the console app behind the sign-in (every #/screen) and every page that is not for the public (sign-in link, payment link, owner pages, /auth, /pay, /stats, /report) stay OUT of search.
// Only a LIVE build asks to be indexed: the preview address (pages.dev) and the test build say noindex and Disallow everything, so a trial copy never competes with the real site.
// Claims stay inside the owner's rules (docs/SUITE_RULES.md section 5): no "100% secure", no "most secure", no "played by major companies".
import { searchNamesText } from "./visible-games.mjs";
export const SITE_NAME = "Corporate Games console";
export const HOME_ORIGIN = "https://home.corporatetambola.com";
export const HELP_EMAIL = "hello@corporatetambola.com";
export const PRIVACY_LINE = "No personal details needed. All participant information is deleted within 24 hours of the game.";
export const LOGO_PATH = "/icons/icon-512.png";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ldText = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/** Crawlers that collect text to TRAIN a model are told no. Search and answer crawlers (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User, Applebot) are not named: they follow the general rules below, which let them read the public pages. */
export const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "cohere-ai", "Meta-ExternalAgent"];

/** the pages of the console and how each one speaks to search. `path` is what a visitor types after the address. */
export function pageList(cfg) {
  return {
    home: { path: "/", file: "index.html", index: true, title: "Corporate Games console: set up and run your team game", description: "Sign in with your work e-mail to set up, share, pay for and run a company game. " + searchNamesText(cfg) + ". No password." },
    games: { path: "/games/", file: "games/index.html", index: true, title: "Games for your team: " + searchNamesText(cfg), description: "Pick a game for your team, create it in a few minutes and share one link. A game can be played with only an employee ID or an e-mail." },
    changes: { path: "/changes", file: "changes.html", index: true, title: "What's new in the Corporate Games console", description: "The latest changes to the Corporate Games console, in plain words: what is new for organizers and hosts, newest first." },
    signin: { path: "/signin.html", file: "signin.html", index: false, title: "Finish signing in: Corporate Games console", description: "Press one button to finish signing in to the Corporate Games console." },
    pay: { path: "/pay-link.html", file: "pay-link.html", index: false, title: "Pay for a game: Corporate Games console", description: "A page for paying for one game. It shows only the amount due." },
    notfound: { path: "/404.html", file: "404.html", index: false, title: "Page not found: Corporate Games console", description: "This page could not be found. Go back to the console, see the games, or write to the help address." },
    funnel: { path: "/owner-funnel/", file: "owner-funnel/index.html", index: false, title: "Owner page: Corporate Games console", description: "A page for the owner only. It shows how many visits reach each step of the games." },
  };
}

/** Organization and WebSite as structured data. Facts only: names, addresses, the support e-mail and the logo already on the site. */
export function jsonLdGraph(cfg, env) {
  const origin = cfg.consoleOrigin[env];
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": HOME_ORIGIN + "/#organization", name: "Corporate Games", url: HOME_ORIGIN + "/", logo: origin + LOGO_PATH, contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: HELP_EMAIL, availableLanguage: "English" } },
      { "@type": "WebSite", "@id": origin + "/#website", name: SITE_NAME, url: origin + "/", description: "Set up, share, pay for and run company games from one place.", inLanguage: "en", publisher: { "@id": HOME_ORIGIN + "/#organization" } },
    ],
  };
}

/** the whole <head> block of one page, as text: title, description, robots, canonical, Open Graph, Twitter card, JSON-LD (indexable pages) */
export function headBlock(cfg, env, key, extraLd = []) {
  const origin = cfg.consoleOrigin[env], p = pageList(cfg)[key];
  if (!p) throw new Error("seo: no such page " + key);
  const live = env === "live", index = p.index && live;
  const url = origin + p.path;
  const out = [`<title>${esc(p.title)}</title>`, `<meta name="description" content="${esc(p.description)}">`, `<meta name="robots" content="${index ? "index,follow,max-image-preview:large" : "noindex,nofollow"}">`];
  if (p.index) {
    out.push(`<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="${esc(SITE_NAME)}">`, `<meta property="og:title" content="${esc(p.title)}">`, `<meta property="og:description" content="${esc(p.description)}">`, `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${esc(origin + LOGO_PATH)}">`, `<meta property="og:image:alt" content="Corporate Games">`,
      `<meta name="twitter:card" content="summary">`, `<meta name="twitter:title" content="${esc(p.title)}">`, `<meta name="twitter:description" content="${esc(p.description)}">`, `<meta name="twitter:image" content="${esc(origin + LOGO_PATH)}">`);
    const graph = jsonLdGraph(cfg, env);
    for (const x of extraLd) graph["@graph"].push(x);
    out.push(`<script type="application/ld+json">${ldText(graph)}</script>`);
  }
  return out.join("\n");
}

/** a built html page with its SEO head: the marker comment is replaced, the placeholder title and robots meta are removed. A page without the marker is a build error, so a page can never ship without its head. */
export function applyHead(html, block, name = "page") {
  if (!html.includes("<!--seo-->")) throw new Error(`seo: ${name} has no <!--seo--> marker in its head`);
  const bare = html.replace(/<title>[^<]*<\/title>\s*/i, "").replace(/<meta name="robots"[^>]*>\s*/i, "").replace(/<meta name="description"[^>]*>\s*/i, "");
  return bare.replace("<!--seo-->", block);
}

export const robotsTxt = (cfg, env) => {
  const origin = cfg.consoleOrigin[env];
  if (env !== "live") return "# A trial copy of the console: nothing here is for search.\nUser-agent: *\nDisallow: /\n";
  const lines = ["# Corporate Games console. Public pages are open to search and answer engines. Sign-in, payment, report and owner pages are not for search.",
    "User-agent: *", "Allow: /$", "Allow: /games/", "Allow: /changes", "Allow: /llms.txt", "Disallow: /auth/", "Disallow: /pay/", "Disallow: /pay-link.html", "Disallow: /signin.html", "Disallow: /report/", "Disallow: /stats/", "Disallow: /owner-funnel/", "",
    "# Crawlers that collect text to train models are not welcome.", ...TRAINING_BOTS.flatMap((b) => [`User-agent: ${b}`, "Disallow: /", ""]),
    `Sitemap: ${origin}/sitemap.xml`, ""];
  return lines.join("\n");
};

/** the sitemap: only the three public pages. `lastmod` is given only where it is true (what's new changes with every release). */
export function sitemapXml(cfg, env, releaseDate = "") {
  const origin = cfg.consoleOrigin[env], pl = pageList(cfg);
  const row = (k) => `  <url><loc>${esc(origin + pl[k].path)}</loc>${k === "changes" && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ? `<lastmod>${releaseDate}</lastmod>` : ""}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["home", "games", "changes"].map(row).join("\n")}\n</urlset>\n`;
}

/** llms.txt (the llmstxt.org layout): a short, true summary for AI assistants, with links to the pages worth reading */
export function llmsTxt(cfg, env, liveGames) {
  const origin = cfg.consoleOrigin[env];
  const games = liveGames.map((g) => `- [${g.name}](${g[env]}/)`).join("\n");
  return `# ${SITE_NAME}

> The organizer's console for Corporate Games. Organizers and hosts sign in with a work e-mail (no password) to set up, share, pay for and run company games, with one sign-in for all of them.

${PRIVACY_LINE} A game can be played with only an employee ID or an e-mail. Players do not sign in to this console: they open the link the organizer shares.

## Pages
- [Games for your team](${origin}/games/): the games an organizer can create, with a Create button for each.
- [What's new](${origin}/changes): the latest changes, in plain words, newest first.
- [Console](${origin}/): sign in to set up and run a game.

## The games
${games}

## Not for assistants or search
- Sign-in, payment, report and owner pages are not for search or summaries: ${origin}/auth/, ${origin}/pay/, ${origin}/report/, ${origin}/stats/ and ${origin}/owner-funnel/. Please do not fetch or summarize them.

## Help
- Write to ${HELP_EMAIL}. On the day of an event, put EVENT DAY in the subject.

## Optional
- [Corporate Games home](${HOME_ORIGIN}/): the front page for all Corporate Games products.
`;
}

/** the "What's new" page: the newest releases in plain words. Only the owner-approved plain sentence of each release (`userNote`) is shown; the technical note, ids and audit details never are. */
export function changesHtml(cfg, env, releases, istText) {
  const origin = cfg.consoleOrigin[env];
  const rows = releases.filter((r) => r && r.version).slice(0, 10);
  const li = (r) => `<li class="change"><h2>Version ${esc(r.version)}</h2><p class="when">${esc(r.releasedAt ? istText(r.releasedAt) : "")}</p><p>${esc(r.userNote || "Small improvements and fixes.")}</p></li>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!--seo-->
<meta name="theme-color" content="#0A2A66">
<link rel="icon" href="/icons/icon-192.png">
<link rel="stylesheet" href="/core/tokens.css">
<link rel="stylesheet" href="/core/app.css">
<script type="module" src="/core/page-version.js"></script>
<script type="module" src="/core/page-consent.js"></script>
</head>
<body>
<main class="wrap"><div class="page changes">
  <h1>What's new</h1>
  <p class="lead">The latest changes to the console, in plain words. Newest first.</p>
  <ol class="changelist">
${rows.map(li).join("\n")}
  </ol>
  <p><a class="btn" href="/">Back to the console</a></p>
</div></main>
</body>
</html>
`;
}
export const CHANGES_LD = (cfg, env) => { const origin = cfg.consoleOrigin[env], page = pageList(cfg).changes; return { "@type": "CollectionPage", "@id": origin + page.path + "#page", name: page.title, url: origin + page.path, isPartOf: { "@id": origin + "/#website" }, inLanguage: "en" }; };
