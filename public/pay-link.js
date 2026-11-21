import { showVersion } from "/core/version.js";
// The page a payee opens from the organizer's "Copy payment link". No sign-in. It shows only the amount due; the money goes into the organizer's own credits for this one game, and the game is marked paid by itself.
const t = (location.pathname.match(/\/pay\/([A-Za-z0-9_-]{20,80})$/) || [])[1] || new URLSearchParams(location.search).get("t") || "";
const $ = (id) => document.getElementById(id);
const BUSY = "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes.";
const call = async (method, path, body) => {
  try { const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }
  catch { return { status: 503, j: { message: BUSY } }; }
};
const money = (d) => d.currency === "USD" ? "US$ " + (d.amountMinor / 100).toFixed(2) : (() => { const r = d.amountMinor / 100; return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 }); })();
const PENDING = "Your payment is on its way. It can take a few minutes. You do not need to pay again.";
const NOTDONE = "The payment did not go through. Nothing has been taken. Press the payment button to try again.";
// the secure payment window opens on top of this page (a frame): nobody leaves the console. When the money arrives this page says so by itself.
let timer = null, listener = null;
const closeFrame = () => { const o = $("overlay"); if (o) o.remove(); if (listener) { window.removeEventListener("message", listener); listener = null; } };
const paidNow = () => { if (timer) clearInterval(timer); closeFrame(); $("go")?.remove(); $("mailrow")?.remove(); $("due").textContent = ""; $("title").textContent = "Paid"; $("msg").textContent = "Thank you. The game is paid and ready."; };
const POLL_MS = 20000; // the console limits each address to a few hundred looks an hour: an open tab must stay far below that (a test checks)
const watch = () => {
  if (timer) clearInterval(timer); let n = 0;
  timer = setInterval(async () => { if (++n > 180) { clearInterval(timer); return; } const r = await call("GET", "/pay/link/info?t=" + encodeURIComponent(t)); if (r.j && r.j.ok && r.j.covered) paidNow(); }, POLL_MS);
};
const openFrame = (frame) => {
  closeFrame();
  const o = document.createElement("div"); o.id = "overlay"; o.className = "overlay"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", "Secure payment");
  const box = document.createElement("div"); box.className = "frame";
  const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = "closeframe"; b.textContent = "Close"; b.addEventListener("click", closeFrame);
  const f = document.createElement("iframe"); f.id = "payiframe"; f.title = "Secure payment"; f.src = frame.url; f.setAttribute("allow", "payment");
  box.append(b, f); o.append(box); document.body.append(o);
  let sent = false;
  listener = async (ev) => {
    if (ev.source !== f.contentWindow || ev.origin !== frame.origin || !ev.data) return;
    const m = ev.data.t;
    if (m === "ready" && !sent) { sent = true; f.contentWindow.postMessage({ t: "open", opts: frame.opts }, frame.origin); }
    else if (m === "paid") {
      closeFrame(); $("msg").textContent = "Checking your payment. This page updates by itself.";
      const r = await call("POST", "/pay/link/confirm", { t, orderId: frame.orderId, resp: ev.data.resp });
      if (r.j && r.j.paid) return paidNow();
      $("msg").textContent = (r.j && r.j.message) || PENDING; watch();
    } else if (m === "failed") { closeFrame(); $("msg").textContent = NOTDONE; }
    else if (m === "dismissed") closeFrame();
  };
  window.addEventListener("message", listener);
};
(async () => {
  const r = await call("GET", "/pay/link/info?t=" + encodeURIComponent(t));
  if (!r.j.ok) { $("msg").textContent = (r.j.message || BUSY) + " Press Try again, or ask the person who sent you this link for a new one."; const rt = $("retry"); rt.hidden = false; rt.addEventListener("click", () => location.reload()); return; }
  $("title").textContent = "Pay for " + (r.j.gameName || "a game");
  if (r.j.covered) { $("title").textContent = "Paid"; $("msg").textContent = "This game is already paid for. Thank you."; return; }
  $("msg").textContent = "The organizer asked you to pay for this game. The game starts as soon as the payment is done.";
  $("due").textContent = "Amount due: " + money(r.j.due);
  $("mailrow").hidden = false;
  const go = $("go"); go.hidden = false; let last = null;
  const start = async () => {
    const email = $("mail").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("msg").textContent = "Please type your e-mail address. The system uses it to match your payment to the right game."; $("mail").focus(); return; }
    go.disabled = true;
    const s = await call("POST", "/pay/link/start", { t, email });
    go.disabled = false;
    if (s.j.ok && s.j.frame) { last = s.j.frame; $("msg").textContent = "Your secure payment window is open. This page updates by itself when the payment arrives."; openFrame(last); watch(); go.textContent = "Open the payment window again"; return; }
    if (s.j.ok && s.j.covered) return paidNow();
    $("msg").textContent = s.j.message || BUSY;
  };
  go.addEventListener("click", () => { if (last && $("mail").value.trim() === (last.opts.prefill && last.opts.prefill.email)) openFrame(last); else start(); });
})();
showVersion();
