// Visit reporter, for the home page, every game site and the console: <script src="https://console.corporatetambola.com/core/reporter.js" data-game="bingo" defer></script>
// First-party, no cookie, no personal details: a random id that lives only in this page's memory, the path without its query, the referrer's host, utm tags, time on the page, deepest scroll, presses, shares and copies.
// It does nothing when the browser says Global Privacy Control or Do Not Track. The console collector switches itself on (VISITS_ON); the 13 funnel steps are reported separately by makeReporter of the game core.
(() => {
  const nav = navigator, doc = document, me = doc.currentScript;
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1" || window.doNotTrack === "1") return;
  const game = (me && me.dataset.game) || "home";
  if (!/^[a-z0-9_-]{1,24}$/.test(game)) return;
  const url = ((me && me.dataset.endpoint) || (me && me.src ? new URL(me.src).origin : location.origin)) + "/stats/v";
  const visit = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => (b % 36).toString(36)).join("");
  const q = new URLSearchParams(location.search), utm = { s: q.get("utm_source") || "", m: q.get("utm_medium") || "", c: q.get("utm_campaign") || "" };
  const base = () => ({ visit, game, path: location.pathname, w: innerWidth, lang: (nav.language || "").slice(0, 10) });
  const send = (o, beacon) => {
    const body = JSON.stringify({ ...base(), ...o });
    try { if (beacon && nav.sendBeacon && nav.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return; } catch { /* fall through */ }
    try { fetch(url, { method: "POST", body, headers: { "content-type": "text/plain" }, keepalive: true, credentials: "omit", mode: "cors" }).catch(() => undefined); } catch { /* never break the page */ }
  };
  const t0 = Date.now(); let deep = 0, left = false;
  const onScroll = () => { const h = doc.documentElement.scrollHeight - innerHeight; deep = Math.max(deep, h <= 0 ? 100 : Math.min(100, Math.round((scrollY / h) * 100))); };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  send({ kind: "page", ref: doc.referrer || "", utm });
  const leave = () => { if (left) return; left = true; send({ kind: "leave", ms: Date.now() - t0, scroll: deep }, true); };
  addEventListener("pagehide", leave); doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") leave(); else left = false; });
  const plain = (s) => String(s || "").replace(/[^A-Za-z0-9 _.\-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  doc.addEventListener("click", (e) => {
    const n = e.target && e.target.closest ? e.target.closest("a,button,[data-track]") : null;
    if (!n) return;
    const href = n.getAttribute && n.getAttribute("href") || "";
    const share = n.hasAttribute("data-share") || /^(mailto:|https?:\/\/(wa\.me|api\.whatsapp\.com|twitter\.com|www\.linkedin\.com))/.test(href);
    send({ kind: share ? "share" : "click", target: plain(n.getAttribute("data-track") || n.getAttribute("aria-label") || n.textContent) });
  }, true);
  doc.addEventListener("copy", () => send({ kind: "copy", target: "copy" }));
})();
