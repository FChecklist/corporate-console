// The public games chooser (/games/), robots.txt and sitemap.xml, made at build time from config/games.json so the addresses can never disagree with the rest of the console.
// The console app itself (signed in) stays out of search; this one page is for people and search engines. Wording: calm, no "we/our", nothing about deleting beyond the one fixed privacy line.
export const PRIVACY_LINE = "No personal details needed. All participant information is deleted within 24 hours of the game.";
export const ID_LINE = "A game can be played with only an employee ID or an e-mail.";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => Number(n).toLocaleString("en-US");

/** the games people can use today, in the order of the file */
export const liveGames = (cfg) => cfg.games.filter((g) => g.status === "live" && g.ready === true);

/** the facts a card shows, only what the game declares */
export function cardFacts(g) {
  const f = [];
  if (g.caps && Number.isInteger(g.caps.auto)) f.push(`Up to ${num(g.caps.auto)} people` + (Number.isInteger(g.caps.manual) ? `, or ${num(g.caps.manual)} when a Host calls the numbers.` : "."));
  if (Number.isInteger(g.rehearsalMax) && g.rehearsalMax > 0) f.push(`Try it first with up to ${g.rehearsalMax} people, no prizes, no payment.`);
  f.push(g.goldenButton === "claim" ? "Players press Claim when they have a winning line." : "The game claims for the players. The button says You won.");
  return f;
}

/** one game's colour as a class (the page allows no inline style) */
export const gamesCss = (cfg) => cfg.games.map((g) => `.g-${g.id}{--accent:${/^#[0-9A-Fa-f]{6}$/.test(g.accent) ? g.accent : "#0B3D91"}}`).join("\n") + "\n";

export function chooserHtml(cfg, env) {
  const consoleOrigin = cfg.consoleOrigin[env];
  const live = liveGames(cfg), soon = cfg.games.filter((g) => !live.includes(g));
  const title = "Corporate games for teams: Tambola, Bingo, Tic Tac Toe and more";
  const desc = "Pick a game for your team, create it in a few minutes and share one link. " + ID_LINE;
  const url = consoleOrigin + "/games/";
  const card = (g) => `<article class="gcard g-${esc(g.id)}"><h2>${esc(g.name)}</h2><ul>${cardFacts(g).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="btns"><a class="btn main" href="${esc(consoleOrigin)}/#/create/${esc(g.id)}" aria-label="Create a game in ${esc(g.name)}">Create a game</a> <a class="btn" href="${esc(g[env])}/" aria-label="Open ${esc(g.name)}">Open ${esc(g.name.replace(/^Corporate /, ""))}</a></p></article>`;
  const soonCard = (g) => `<article class="gcard soon g-${esc(g.id)}"><h2>${esc(g.name)}</h2><p>Opening soon.</p></article>`;
  const ld = { "@context": "https://schema.org", "@type": "ItemList", name: "Corporate games", itemListElement: live.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.name, url: g[env] + "/" })) };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="theme-color" content="#0A2A66">
<link rel="icon" href="/icons/icon-192.png">
<link rel="stylesheet" href="/core/tokens.css">
<link rel="stylesheet" href="/core/chooser.css">
<link rel="stylesheet" href="/games/games.css">
<script type="module" src="/core/page-version.js"></script>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<main class="chooser">
<h1>Choose a game for your team</h1>
<p class="lead">Pick a game, create it in a few minutes and share one link. ${esc(ID_LINE)}</p>
<div class="grid">
${live.map(card).join("\n")}
${soon.map(soonCard).join("\n")}
</div>
<p class="line">${esc(PRIVACY_LINE)}</p>
<p class="line"><a href="${esc(consoleOrigin)}/">Already organizing a game? Sign in to the console.</a></p>
</main>
</body>
</html>
`;
}

export const robotsTxt = (cfg, env) => `User-agent: *\nAllow: /games/\nDisallow: /auth/\nDisallow: /report/\nDisallow: /stats/\n\nSitemap: ${cfg.consoleOrigin[env]}/sitemap.xml\n`;
export const sitemapXml = (cfg, env) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${cfg.consoleOrigin[env]}/games/</loc></url>\n</urlset>\n`;
