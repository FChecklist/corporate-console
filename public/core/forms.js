// Plain-word form helpers (0.3.0). Every form field gets: an example the person can copy the shape of, and its own error line right under it
// (said in words that tell what to do, read out by screen readers, never colour alone). One press of a button does the job once: a second press while it works is ignored.
// No inline style, no innerHTML (the page's policy forbids both).
import { el } from "./dom.js";

/**
 * Gives an input an example line and an error line. Returns { hint, err, show(text), clear() }.
 * `show` fills the error line, marks the input as wrong (aria-invalid) and returns false, so a check can end with `return f.show("...")`.
 */
export function describeField(input, example, o = {}) {
  const id = input.id || (o.id || "field");
  const hint = el("p", { class: "fieldhint", id: id + "-hint", text: example });
  const err = el("p", { class: "fielderror hide", id: id + "-err", role: "alert" });
  input.setAttribute("aria-describedby", id + "-hint " + id + "-err");
  const api = {
    hint, err,
    show(text) { err.textContent = text; err.classList.remove("hide"); input.setAttribute("aria-invalid", "true"); if (o.focus !== false && input.focus) input.focus(); return false; },
    clear() { err.textContent = ""; err.classList.add("hide"); input.removeAttribute("aria-invalid"); },
  };
  input.addEventListener("input", api.clear);
  input.addEventListener("change", api.clear);
  return api;
}

/** wraps an action so a second press while it still works does nothing, and the pressed button is locked meanwhile (a double tap never sends twice) */
export function once(fn) {
  let busy = false;
  return async (...args) => {
    if (busy) return undefined;
    busy = true;
    const ev = args[0], b = ev && ev.currentTarget && "disabled" in ev.currentTarget ? ev.currentTarget : null; // taken now: it is gone after the first wait
    if (b) b.disabled = true;
    try { return await fn(...args); } finally { busy = false; if (b && b.isConnected) b.disabled = false; }
  };
}

/** locks a group of buttons while one action works (one tap on "Start" must also lock "Try a free game", or two drafts get made) */
export async function lockAll(buttons, fn) {
  const list = [...buttons].filter(Boolean), was = list.map((b) => b.disabled);
  list.forEach((b) => { b.disabled = true; });
  try { return await fn(); } finally { list.forEach((b, i) => { if (b.isConnected !== false) b.disabled = was[i]; }); }
}
