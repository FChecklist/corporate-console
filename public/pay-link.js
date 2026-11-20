import { showVersion } from "/core/version.js";
// The page a payee opens from the organizer's "Copy payment link". No sign-in. It shows only the amount due; the money goes into the organizer's own credits for this one game, and the game is marked paid by itself.
const t = (location.pathname.match(/\/pay\/([0-9a-f]{48})$/) || [])[1] || new URLSearchParams(location.search).get("t") || "";
const $ = (id) => document.getElementById(id);
const BUSY = "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes.";
const call = async (method, path, body) => {
  try { const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }
  catch { return { status: 503, j: { message: BUSY } }; }
};
const inr = (minor) => { const r = Number(minor) / 100; return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
// the secure payment window opens on top of this page (a frame): nobody leaves the console. When the money arrives this page says so by itself.
let timer = null;
const closeFrame = () => { const o = $("overlay"); if (o) o.remove(); };
const openFrame = (url) => {
  closeFrame();
  const o = document.createElement("div"); o.id = "overlay"; o.className = "overlay"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", "Secure payment");
  const box = document.createElement("div"); box.className = "frame";
  const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.id = "closeframe"; b.textContent = "Close"; b.addEventListener("click", closeFrame);
  const f = document.createElement("iframe"); f.id = "payiframe"; f.title = "Secure payment"; f.src = url; f.setAttribute("allow", "payment");
  box.append(b, f); o.append(box); document.body.append(o);
};
const paidNow = () => { if (timer) clearInterval(timer); closeFrame(); $("go")?.remove(); $("due").textContent = ""; $("title").textContent = "Paid"; $("msg").textContent = "Thank you. The game is paid and ready."; };
const watch = () => {
  if (timer) clearInterval(timer); let n = 0;
  timer = setInterval(async () => { if (++n > 240) { clearInterval(timer); return; } const r = await call("GET", "/pay/link/info?t=" + encodeURIComponent(t)); if (r.j && r.j.ok && r.j.covered) paidNow(); }, 5000);
};
(async () => {
  const r = await call("GET", "/pay/link/info?t=" + encodeURIComponent(t));
  if (!r.j.ok) { $("msg").textContent = r.j.message || BUSY; return; }
  $("title").textContent = "Pay for " + (r.j.gameName || "a game");
  if (r.j.covered) { $("title").textContent = "Paid"; $("msg").textContent = "This game is already paid for. Thank you."; return; }
  $("msg").textContent = "The organizer asked you to pay for this game. The game starts as soon as the payment is done.";
  $("due").textContent = "Amount due: " + inr(r.j.due.inrMinor) + " (= US$ " + r.j.due.usd + ")";
  const go = $("go"); go.hidden = false;
  go.addEventListener("click", async () => {
    go.disabled = true;
    const s = await call("POST", "/pay/link/start", { t });
    if (s.j.ok && s.j.payPage) { $("msg").textContent = "Your secure payment window is open. This page updates by itself when the payment arrives."; openFrame(s.j.payPage); watch(); go.disabled = false; go.textContent = "Open the payment window again"; go.onclick = () => openFrame(s.j.payPage); return; }
    if (s.j.ok && s.j.covered) { paidNow(); return; }
    $("msg").textContent = s.j.message || BUSY; go.disabled = false;
  });
})();
showVersion();
