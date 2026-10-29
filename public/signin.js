// The page behind the one-tap link in the sign-in mail. Opening it does nothing; the button finishes the sign-in (a mail scanner that only opens links changes nothing).
const t = new URLSearchParams(location.search).get("t") || "";
const msg = document.getElementById("msg"), go = document.getElementById("go");
history.replaceState(null, "", location.pathname); // the one-time token leaves the address bar at once
go.addEventListener("click", async () => {
  go.disabled = true;
  try {
    const r = await fetch("/auth/link", { method: "POST", headers: { "content-type": "application/json", "x-console": "1" }, body: JSON.stringify({ t }) });
    if (r.ok) { location.replace("/"); return; }
    const j = await r.json().catch(() => ({}));
    msg.textContent = j.message || "That link has run out. Please ask for a new one.";
  } catch { msg.textContent = "The system could not reach the server. Please try again."; }
  go.disabled = false;
});

// the version and release time, on this screen too
fetch("/version.json").then((r) => r.json()).then((v) => { if (v && v.version && v.releasedAtIST) document.getElementById("version-line").textContent = `Version ${v.version}, released ${v.releasedAtIST}`; }).catch(() => {});
