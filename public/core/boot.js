// Starts the console: loads the words, chooses the laptop or the phone design, registers the offline worker, and shows 'update ready' when a new version waits.
// One core, two designs: width 900 and up = laptop, below = phone. A person can override the choice (kept only in this browser, never required).
import { GAMES } from "./games.config.js";
import { el, clear } from "./dom.js";
import { createApi } from "./api.js";
import { menuItems, partsOf, menuFor } from "./routes.js";

export { menuItems };

export const BREAKPOINT = 900;
export const designFor = (width, override) => (override === "laptop" || override === "phone" ? (override === "laptop" ? "laptop" : "phone") : width >= BREAKPOINT ? "laptop" : "phone");

const readOverride = () => { try { return localStorage.getItem("cg-design"); } catch { return null; } };

export async function loadCopy() { return (await fetch("/copy/en.json")).json(); }


export function privacyStrip(copy) {
  const p = copy.privacy;
  const more = el("span", { class: "priv-more hide", text: " " + p.more });
  const btn = el("button", { class: "more-btn", type: "button", "aria-expanded": "false", text: p.moreButton, onclick: () => { const open = more.classList.toggle("hide") === false; btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? p.lessButton : p.moreButton; } });
  return el("div", { class: "priv", role: "note" }, el("div", { class: "wrap" }, el("span", { text: p.phrases.join(" · ") + "." }), more, btn));
}

let current = null, last = "";
/** the state the screens share: the api (keys in memory), who is signed in, the games' names and colours */
const names = Object.fromEntries(GAMES.map((g) => [g.id, g.name])), colors = Object.fromEntries(GAMES.map((g) => [g.id, g.accent]));
export const app = { api: null, signedIn: false, email: null };

const routeOf = () => location.hash.replace(/^#\/?/, "") || "home";

async function screenFor(route, outlet, copy) {
  const ctx = { api: app.api, copy, names, colors, games: GAMES, designIsPhone: window.innerWidth < BREAKPOINT, email: app.email, onSignedIn, onSignedOut, termsUrl: GAMES[0].origin + "/terms.html" };
  if (!app.signedIn) return (await import("../screens/signin.js")).renderSignIn(outlet, ctx);
  const parts = partsOf("#/" + route), first = parts[0];
  if (first === "mygames") return (await import("../screens/mygames.js")).renderMyGames(outlet, ctx);
  if (first === "create") return (await import("../screens/create.js")).renderCreate(outlet, ctx);
  if (first === "billing") return (await import("../screens/billing.js")).renderBilling(outlet, ctx);
  if (first === "account") return (await import("../screens/account.js")).renderAccount(outlet, ctx);
  if (first === "view") return (await import("../screens/playerview.js")).renderPlayerView(outlet, ctx, parts[1], parts[2]);
  return (await import("../screens/home.js")).renderHome(outlet, ctx);
}

export async function mount(root, copy, design) {
  const route = routeOf();
  if (current === design + "|" + route + "|" + app.signedIn) return;
  current = design + "|" + route + "|" + app.signedIn;
  document.body.classList.toggle("has-tabbar", design === "phone" && app.signedIn);
  document.documentElement.dataset.design = design;
  const mod = await import(design === "laptop" ? "../view-laptop/shell.js" : "../view-mobile/shell.js");
  clear(root);
  const outlet = mod.mountShell(root, { copy, items: menuItems(copy), strip: privacyStrip(copy), route: menuFor(route), email: app.email, signedIn: app.signedIn });
  const help = el("p", { class: "helpline" }, copy.help.text + " ", el("a", { href: "mailto:" + copy.help.email }, copy.help.email));
  root.querySelector("main").after(help);
  await screenFor(route, outlet, copy);
}

async function onSignedIn() {
  const me = await app.api.auth.me();
  app.signedIn = !!me.json?.signedIn; app.email = me.json?.email || null;
  if (app.signedIn) await app.api.connect();
  current = null; location.hash = "#/home"; window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** after Sign out or Close my account: back to the sign-in screen, nothing of the person kept on the page */
function onSignedOut() {
  app.signedIn = false; app.email = null; current = null; location.hash = "#/home"; window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function updateBar(copy, reg) {
  if (document.querySelector(".updatebar")) return;
  const bar = el("div", { class: "updatebar", role: "status" }, el("span", { text: copy.updateReady }), el("button", { type: "button", text: copy.updateButton, onclick: () => { reg.waiting && reg.waiting.postMessage("skip-waiting"); location.reload(); } }));
  document.body.append(bar);
}

export async function start() {
  const root = document.getElementById("app");
  const copy = await loadCopy();
  app.api = createApi({ games: GAMES, consoleOrigin: location.origin });
  const me = await app.api.auth.me();
  app.signedIn = !!me.json?.signedIn; app.email = me.json?.email || null;
  if (app.signedIn) app.api.connect(); // keys arrive in the background; each game on its own
  const pick = () => designFor(window.innerWidth, readOverride());
  await mount(root, copy, pick());
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => mount(root, copy, pick()), 80); });
  window.addEventListener("hashchange", () => { current = null; last = routeOf(); mount(root, copy, pick()); });
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (reg.waiting) updateBar(copy, reg);
      reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) updateBar(copy, reg); }); });
    } catch { /* the console works without the offline worker */ }
  }
}

if (typeof document !== "undefined" && document.getElementById("app")) start();
