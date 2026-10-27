// Starts the console: loads the words, chooses the laptop or the phone design, registers the offline worker, and shows 'update ready' when a new version waits.
// One core, two designs: width 900 and up = laptop, below = phone. A person can override the choice (kept only in this browser, never required).
import { GAMES } from "./games.config.js";
import { el, clear } from "./dom.js";

export const BREAKPOINT = 900;
export const designFor = (width, override) => (override === "laptop" || override === "phone" ? (override === "laptop" ? "laptop" : "phone") : width >= BREAKPOINT ? "laptop" : "phone");

const readOverride = () => { try { return localStorage.getItem("cg-design"); } catch { return null; } };

export async function loadCopy() { return (await fetch("/copy/en.json")).json(); }

/** the menu entries, in order: Home, the six games, Billing */
export const menuItems = (copy) => [{ id: "home", label: copy.menu.home }, ...GAMES.map((g) => ({ id: g.id, label: g.short })), { id: "billing", label: copy.menu.billing }];

export function privacyStrip(copy) {
  const p = copy.privacy;
  const more = el("span", { class: "priv-more hide", text: " " + p.more });
  const btn = el("button", { class: "more-btn", type: "button", "aria-expanded": "false", text: p.moreButton, onclick: () => { const open = more.classList.toggle("hide") === false; btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? p.lessButton : p.moreButton; } });
  return el("div", { class: "priv", role: "note" }, el("div", { class: "wrap" }, el("span", { text: p.phrases.join(" · ") + "." }), more, btn));
}

let current = null;
export async function mount(root, copy, design) {
  if (current === design) return;
  current = design;
  document.body.classList.toggle("has-tabbar", design === "phone");
  document.documentElement.dataset.design = design;
  const mod = await import(design === "laptop" ? "../view-laptop/shell.js" : "../view-mobile/shell.js");
  clear(root);
  mod.mountShell(root, { copy, items: menuItems(copy), strip: privacyStrip(copy), route: location.hash.replace(/^#\/?/, "") || "home" });
}

function updateBar(copy, reg) {
  if (document.querySelector(".updatebar")) return;
  const bar = el("div", { class: "updatebar", role: "status" }, el("span", { text: copy.updateReady }), el("button", { type: "button", text: copy.updateButton, onclick: () => { reg.waiting && reg.waiting.postMessage("skip-waiting"); location.reload(); } }));
  document.body.append(bar);
}

export async function start() {
  const root = document.getElementById("app");
  const copy = await loadCopy();
  const pick = () => designFor(window.innerWidth, readOverride());
  await mount(root, copy, pick());
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => mount(root, copy, pick()), 80); });
  window.addEventListener("hashchange", () => { current = null; mount(root, copy, pick()); });
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (reg.waiting) updateBar(copy, reg);
      reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) updateBar(copy, reg); }); });
    } catch { /* the console works without the offline worker */ }
  }
}

if (typeof document !== "undefined" && document.getElementById("app")) start();
