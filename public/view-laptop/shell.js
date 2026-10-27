// Laptop design: top menu (no brand text), privacy strip, one main area. Returns the main area for the screens to fill.
import { el } from "../core/dom.js";

export function mountShell(root, { items, strip, route, email, signedIn }) {
  const outlet = el("div", { id: "outlet" });
  const on = (id) => route === id || route.startsWith(id + "/");
  const kids = [];
  if (signedIn) {
    const nav = el("nav", { "aria-label": "Main" }, items.map((i) => el("a", { href: "#/" + i.id, class: on(i.id) ? "on" : "", "aria-current": on(i.id) ? "page" : false, text: i.label })));
    kids.push(el("header", { class: "top" }, el("div", { class: "in" }, nav, el("a", { class: "me", href: "#/account", id: "me", text: email || "" }))));
  }
  root.append(...kids, strip, el("main", { id: "main", tabindex: "-1" }, outlet));
  return outlet;
}
