// Laptop design: top menu (no brand text), privacy strip, one main area. The screens themselves come from the screen modules.
import { el } from "../core/dom.js";

export function mountShell(root, { items, strip, route }) {
  const nav = el("nav", { "aria-label": "Main" }, items.map((i) => el("a", { href: "#/" + i.id, class: route === i.id || (i.id === "home" && route === "home") ? "on" : "", "aria-current": route === i.id ? "page" : false, text: i.label })));
  const me = el("a", { class: "me", href: "#/account", id: "me", text: "" });
  root.append(el("header", { class: "top" }, el("div", { class: "in" }, nav, me)), strip, el("main", { id: "main", tabindex: "-1" }, el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { id: "screen-title", text: items.find((i) => i.id === route)?.label || "" })))));
}
