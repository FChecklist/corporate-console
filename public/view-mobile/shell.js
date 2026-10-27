// Phone design: slim top bar with the screen title (no brand text), privacy strip, bottom bar Home / My games / Billing / More.
import { el } from "../core/dom.js";

const ICON = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  mygames: "M4 5h16v14H4zM4 10h16M10 5v14",
  billing: "M3 7h18v10H3zM3 11h18M7 15h3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
const icon = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "26"); s.setAttribute("height", "26"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.9"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); return s; };

export function mountShell(root, { copy, items, strip, route, signedIn }) {
  const outlet = el("div", { id: "outlet" });
  const first = route.split("/")[0];
  const title = signedIn ? (items.find((i) => i.id === first)?.label || { mygames: "My games", create: "Create a new game", play: "Play as a participant", more: "More", game: "Game", account: "Account", versions: "Versions" }[first] || copy.menu.home) : "Sign in";
  const bar = copy.mobileBar, on = (...ids) => ids.includes(first);
  const tab = (id, label, ico, ...also) => el("a", { href: "#/" + id, class: on(id, ...also) ? "on" : "", "aria-current": on(id, ...also) ? "page" : false }, icon(ico), el("span", { text: label }));
  root.append(el("div", { class: "mtop" }, el("h2", { id: "screen-title", text: title })), strip, el("main", { id: "main", tabindex: "-1" }, outlet),
    ...(signedIn ? [el("nav", { class: "tabbar", "aria-label": "Main" }, tab("home", bar.home, ICON.home, "create"), tab("mygames", bar.mygames, ICON.mygames, "game"), tab("billing", bar.billing, ICON.billing), tab("more", bar.more, ICON.more, "play", "versions", "account"))] : []));
  return outlet;
}
