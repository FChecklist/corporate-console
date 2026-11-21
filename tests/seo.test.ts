// FALSIFIED BY: seo-title-duplicate, seo-canonical-wrong, seo-jsonld-missing, seo-preview-indexable, seo-sitemap-private, seo-robots-open-auth, seo-llms-missing-game, seo-changes-leaks-note, seo-no-marker-ok
// SEO and AI-search (0.2.2): title and description per page, canonical, Open Graph, JSON-LD Organization and WebSite, sitemap, robots.txt, llms.txt, for console.corporatetambola.com.
import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";
import { headBlock, applyHead, pageList, jsonLdGraph, robotsTxt, sitemapXml, llmsTxt, changesHtml, TRAINING_BOTS } from "../seo.mjs";

const root = join(import.meta.dir, "..");
const cfg = JSON.parse(readFileSync(join(root, "config/games.json"), "utf8"));
const releases = JSON.parse(readFileSync(join(root, "releases.json"), "utf8"));
const LIVE = "https://console.corporatetambola.com";
const live = mkdtempSync(join(tmpdir(), "seo-live-")), prev = mkdtempSync(join(tmpdir(), "seo-prev-"));
build({ env: "live", out: live, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt });
build({ env: "preview", out: prev, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt });
const rd = (d: string, p: string) => readFileSync(join(d, p), "utf8");
const PUBLIC = [["home", "index.html", "/"], ["games", "games/index.html", "/games/"], ["changes", "changes.html", "/changes"]];
const PRIVATE = [["signin", "signin.html"], ["pay", "pay-link.html"], ["funnel", "owner-funnel/index.html"]];
const meta = (html: string, name: string) => new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`).exec(html)?.[1];
const ld = (html: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));

test("every public page has its own title (under 65 characters) and its own description (70 to 170 characters); no two pages share either", () => {
  const seen = { t: new Set<string>(), d: new Set<string>() };
  for (const [, f] of [...PUBLIC, ...PRIVATE]) {
    const html = rd(live, f as string);
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
    expect([f, titles.length]).toEqual([f, 1]);
    expect([f, titles[0].length <= 65 && titles[0].length >= 15]).toEqual([f, true]);
    const d = meta(html, "description")!; expect([f, !!d && d.length >= 40 && d.length <= 170]).toEqual([f, true]);
    expect([f, seen.t.has(titles[0])]).toEqual([f, false]); seen.t.add(titles[0]);
    expect([f, seen.d.has(d)]).toEqual([f, false]); seen.d.add(d);
    expect([f, (html.match(/<meta name="description"/g) || []).length]).toEqual([f, 1]);
    expect(/<html lang="en"/.test(html)).toBe(true);
    expect(/<meta name="viewport"/.test(html)).toBe(true);
  }
});

test("the three public pages say index; canonical is the live address of that very page, once; Open Graph and Twitter tags match the title, description and address", () => {
  for (const [key, f, path] of PUBLIC) {
    const html = rd(live, f);
    expect([f, meta(html, "robots")]).toEqual([f, "index,follow,max-image-preview:large"]);
    expect([f, [...html.matchAll(/<link rel="canonical" href="([^"]*)">/g)].map((m) => m[1])]).toEqual([f, [LIVE + path]]);
    const title = /<title>([^<]*)<\/title>/.exec(html)![1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    expect([f, meta(html, "og:url"), meta(html, "og:type"), meta(html, "og:site_name")]).toEqual([f, LIVE + path, "website", "Corporate Games console"]);
    expect([f, (meta(html, "og:title") || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'") === title.replace(/&#39;/g, "'")]).toEqual([f, true]);
    expect([f, meta(html, "og:description")]).toEqual([f, meta(html, "description")]);
    expect([f, meta(html, "og:image")]).toEqual([f, LIVE + "/icons/icon-512.png"]);
    expect([f, meta(html, "twitter:card")]).toEqual([f, "summary"]);
    expect(existsSync(join(live, "icons/icon-512.png"))).toBe(true); // the image the tags point at is really shipped
  }
});

test("the pages that are not for the public say noindex, carry no canonical and no Open Graph, and are not in the sitemap", () => {
  for (const [, f] of PRIVATE) {
    const html = rd(live, f);
    expect([f, meta(html, "robots")]).toEqual([f, "noindex,nofollow"]);
    expect([f, /rel="canonical"|og:title|ld\+json/.test(html)]).toEqual([f, false]);
  }
  const map = rd(live, "sitemap.xml");
  for (const p of ["signin", "pay", "owner-funnel", "/auth", "/stats", "/report"]) expect([p, map.includes(p)]).toEqual([p, false]);
});

test("structured data: Organization and WebSite (JSON-LD) on every public page, with the live addresses, the support e-mail and a logo that exists; /games/ adds the list of games, /changes its page", () => {
  for (const [, f, path] of PUBLIC) {
    const html = rd(live, f), g = ld(html), byType = (t: string) => g["@graph"].filter((x: any) => x["@type"] === t);
    expect(g["@context"]).toBe("https://schema.org");
    const org = byType("Organization")[0], site = byType("WebSite")[0];
    expect([f, org.name, org.url]).toEqual([f, "Corporate Games", "https://home.corporatetambola.com/"]);
    expect([f, org.logo, org.contactPoint.email]).toEqual([f, LIVE + "/icons/icon-512.png", "hello@corporatetambola.com"]);
    expect([f, site.name, site.url, site.publisher["@id"], site.inLanguage]).toEqual([f, "Corporate Games console", LIVE + "/", org["@id"], "en"]);
    expect([f, "potentialAction" in site]).toEqual([f, false]); // there is no search box on the site, so none is claimed
    if (f === "games/index.html") { const list = byType("ItemList")[0]; expect(list.itemListElement.map((i: any) => i.url).sort()).toEqual(cfg.games.filter((x: any) => x.status === "live" && x.ready).map((x: any) => x.live + "/").sort()); }
    if (f === "changes.html") expect(byType("CollectionPage")[0].url).toBe(LIVE + "/changes");
    expect(/<\/script>/i.test(JSON.stringify(g))).toBe(false); // a script block cannot be closed from inside the data
  }
});

test("only a LIVE build asks to be found: the trial address says noindex on every page and 'Disallow: /' in robots.txt, and has no sitemap rows pointing at it as the real site", () => {
  for (const [, f] of [...PUBLIC, ...PRIVATE]) expect([f, meta(rd(prev, f as string), "robots")]).toEqual([f, "noindex,nofollow"]);
  expect(rd(prev, "robots.txt")).toMatch(/User-agent: \*\nDisallow: \/\n/);
  expect(rd(prev, "robots.txt")).not.toMatch(/Allow:|Sitemap:/);
  expect(rd(prev, "robots.txt").includes(LIVE)).toBe(false);
});

test("robots.txt (live): public pages open; sign-in, payment, report, stats and owner paths closed; training crawlers told no; the sitemap is named; no wildcard that opens everything", () => {
  const r = rd(live, "robots.txt");
  const star = /User-agent: \*\n([\s\S]*?)\n\n/.exec(r)![1].split("\n");
  for (const a of ["Allow: /$", "Allow: /games/", "Allow: /changes", "Disallow: /auth/", "Disallow: /pay/", "Disallow: /pay-link.html", "Disallow: /signin.html", "Disallow: /report/", "Disallow: /stats/", "Disallow: /owner-funnel/"]) expect([a, star.includes(a)]).toEqual([a, true]);
  expect(star.includes("Disallow: /")).toBe(false); // the general rule never closes the whole site
  for (const b of TRAINING_BOTS) expect([b, new RegExp(`User-agent: ${b}\\nDisallow: /\\n`).test(r)]).toEqual([b, true]);
  for (const b of ["Googlebot", "bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User"]) expect([b, r.includes(`User-agent: ${b}`)]).toEqual([b, false]); // search and answer crawlers follow the general rule
  expect(r).toContain(`Sitemap: ${LIVE}/sitemap.xml`);
});

test("sitemap.xml: exactly the three public pages, live addresses, valid XML shape, lastmod only on what's new and only as a real date; every row is a page that is shipped", () => {
  const map = rd(live, "sitemap.xml");
  expect([...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([LIVE + "/", LIVE + "/games/", LIVE + "/changes"]);
  expect(map.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
  expect([...map.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1])).toEqual([String(releases[0].releasedAt).slice(0, 10)]);
  for (const [, f] of PUBLIC) expect([f, existsSync(join(live, f as string))]).toEqual([f, true]);
  expect(sitemapXml(cfg, "live", "not a date").includes("lastmod")).toBe(false);
});

test("llms.txt (live): a title, a one-paragraph summary, the pages, every live game with its address, the private paths named as off limits, the help address; only the owner's approved claims", () => {
  const t = rd(live, "llms.txt");
  expect(t.startsWith("# Corporate Games console\n\n> ")).toBe(true);
  for (const h of ["## Pages", "## The games", "## Not for assistants or search", "## Help", "## Optional"]) expect([h, t.includes(h)]).toEqual([h, true]);
  for (const g of cfg.games.filter((x: any) => x.status === "live" && x.ready)) expect([g.id, t.includes(`[${g.name}](${g.live}/)`)]).toEqual([g.id, true]);
  for (const p of ["/auth/", "/pay/", "/report/", "/stats/", "/owner-funnel/"]) expect([p, t.includes(LIVE + p)]).toEqual([p, true]);
  expect(t).toContain("No personal details needed. All participant information is deleted within 24 hours of the game.");
  expect(t).toContain("hello@corporatetambola.com");
  for (const link of [...t.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1])) expect([link, /^https:\/\/([a-z]+\.)?corporatetambola\.com\//.test(link)]).toEqual([link, true]);
});

test("nothing the owner told us not to claim appears in any search file or page head: no '100% secure', 'most secure', 'major companies', 'forever', and never the word 'private' in customer text", () => {
  const files = ["index.html", "games/index.html", "changes.html", "signin.html", "pay-link.html", "robots.txt", "sitemap.xml", "llms.txt"];
  for (const f of files) { const t = rd(live, f); expect([f, /100% secure|most secure|major companies|\bforever\b|guarantee|\bprivate\b/i.test(t.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""))]).toEqual([f, false]); }
});

test("/changes shows the plain sentence of the last releases, newest first, and never the technical note, ids, audits or commit", () => {
  const html = rd(live, "changes.html");
  const versions = [...html.matchAll(/<h2>Version ([\d.]+)<\/h2>/g)].map((m) => m[1]);
  expect(versions).toEqual(releases.slice(0, 10).map((r: any) => r.version));
  expect(html).toContain(releases[0].userNote.replace(/'/g, "&#39;").replace(/&/g, "&amp;") === releases[0].userNote ? releases[0].userNote : releases[0].userNote.replace(/&/g, "&amp;"));
  for (const r of releases) if (r.note) expect([r.version, html.includes(r.note)]).toEqual([r.version, false]);
  expect(/audit|commit|rollback|re-vendor|bridge|migration|PR #|session|token|secret|sha\b/i.test(html.replace(/<head>[\s\S]*?<\/head>/, ""))).toBe(false);
  expect(html).toContain('/core/page-version.js'); // the footer (version, what's new, cookie choices) is on this page too
  const v = JSON.parse(rd(live, "version.json"));
  expect(v.product).toBe("corporate-console");
  expect(v.changes.length).toBe(Math.min(20, releases.length));
  expect(v.changes[0]).toEqual({ version: releases[0].version, releasedAt: releases[0].releasedAt, what: releases[0].userNote });
  expect(JSON.stringify(v)).not.toMatch(/audit|rollback|session/i);
});

test("a page that has no <!--seo--> marker stops the build, and a head block always carries title, description, robots", () => {
  expect(() => applyHead("<html><head><title>x</title></head></html>", "<title>y</title>", "x.html")).toThrow(/no <!--seo--> marker/);
  const out = applyHead('<head><title>old</title><meta name="robots" content="noindex"><!--seo--></head>', headBlock(cfg, "live", "home"));
  expect((out.match(/<title>/g) || []).length).toBe(1);
  expect((out.match(/name="robots"/g) || []).length).toBe(1);
  expect(() => headBlock(cfg, "live", "nope")).toThrow();
  for (const [k, p] of Object.entries(pageList(cfg))) expect([k, (p as any).path.startsWith("/")]).toEqual([k, true]);
});

test("each page is reachable from the console's own links: the console page links to games and what's new; the games page links back to the console; every built page loads the cookie banner and the footer", () => {
  expect(rd(live, "index.html")).toContain('href="/games/"');
  expect(rd(live, "index.html")).toContain('href="/changes"');
  expect(rd(live, "games/index.html")).toContain(`href="${LIVE}/"`);
  expect(rd(live, "changes.html")).toContain('href="/"');
  for (const f of ["signin.html", "pay-link.html", "games/index.html", "changes.html"]) expect([f, /\/core\/page-consent\.js/.test(rd(live, f))]).toEqual([f, true]);
  expect(rd(live, "core/boot.js")).toContain("startConsent()");
  const html = rd(live, "index.html");
  expect(html).toContain("<h1>Corporate Games console</h1>"); // there is real text in the first page for a crawler that does not run scripts
  expect(rd(live, "core/boot.js")).toMatch(/const root = document\.getElementById\("app"\);\n  clear\(root\);/); // ...and the app clears it at once
});
