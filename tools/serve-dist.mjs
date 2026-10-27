// node tools/serve-dist.mjs [--dir dist] [--port 0]
// A small static file server for tests: it sends the headers of dist/_headers (so a Content-Security-Policy mistake shows up as a real browser error) and
// an optional set of fake /auth/* answers. Exports startServer() for the browser tests.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

/** parse a Cloudflare _headers file into [{ pattern, headers }] */
export function parseHeaders(text) {
  const blocks = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; blocks.push(cur); }
    else if (cur) { const i = line.indexOf(":"); if (i > 0) cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return blocks;
}
const matches = (pattern, path) => pattern === path || (pattern.endsWith("/*") && path.startsWith(pattern.slice(0, -1))) || pattern === "/*";

export function startServer({ dir = "dist", port = 0, extra } = {}) {
  const root = resolve(dir), blocks = existsSync(join(root, "_headers")) ? parseHeaders(readFileSync(join(root, "_headers"), "utf8")) : [];
  const log = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    log.push(req.method + " " + url.pathname);
    if (extra) { const handled = await extra(req, res, url); if (handled) return; }
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    let file = join(root, p);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { if (!extname(p) && existsSync(join(root, p + ".html"))) file = join(root, p + ".html"); else { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; } }
    const h = { "content-type": TYPES[extname(file)] || "application/octet-stream" };
    for (const b of blocks) if (matches(b.pattern, url.pathname)) Object.assign(h, b.headers);
    res.writeHead(200, h); res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ origin: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const s = await startServer({ dir: get("--dir", "dist"), port: Number(get("--port", 0)) });
  console.log("serving on " + s.origin);
}
