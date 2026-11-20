import { showVersion } from "/core/version.js";
// The page a payee opens from the organizer's "Copy payment link". No sign-in. It shows only the amount due; the money goes into the organizer's own credits for this one game, and the game is marked paid by itself.
const t = new URLSearchParams(location.search).get("t") || "";
const $ = (id) => document.getElementById(id);
const BUSY = "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes.";
const call = async (method, path, body) => {
  try { const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; }
  catch { return { status: 503, j: { message: BUSY } }; }
};
const inr = (minor) => { const r = Number(minor) / 100; return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
(async () => {
  const r = await call("GET", "/pay/link/info?t=" + encodeURIComponent(t));
  if (!r.j.ok) { $("msg").textContent = r.j.message || BUSY; return; }
  $("title").textContent = "Pay for " + (r.j.gameName || "a game");
  if (r.j.covered) { $("msg").textContent = "This game is already paid for. Thank you."; return; }
  $("msg").textContent = "The organizer asked you to pay for this game. The game starts as soon as the payment is done.";
  $("due").textContent = "Amount due: " + inr(r.j.due.inrMinor) + " (= US$ " + r.j.due.usd + ")";
  const go = $("go"); go.hidden = false;
  go.addEventListener("click", async () => {
    go.disabled = true;
    const s = await call("POST", "/pay/link/start", { t });
    if (s.j.ok && s.j.payPage) { $("msg").textContent = "Opening the payment page…"; location.assign(s.j.payPage); return; }
    if (s.j.ok && s.j.covered) { $("msg").textContent = "This game is already paid for. Thank you."; go.hidden = true; return; }
    $("msg").textContent = s.j.message || BUSY; go.disabled = false;
  });
})();
showVersion();
