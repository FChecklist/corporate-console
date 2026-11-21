// The step banner (0.2.2): the six steps an organizer takes to run a game, in plain English, with the step you are on highlighted.
// The names are the ones the game's own setup screen uses (packages/game-pack/zc-flow.js STEPS); a test keeps the two lists the same, so the console and the game never disagree.
// Pure rules first (tested without a page), then the small part that draws them. No inline style, no innerHTML.
export const STEPS = [
  { n: 1, id: "when", name: "Date and time", plain: "Choose the day and the time." },
  { n: 2, id: "who", name: "Who is this game for", plain: "Choose who can join." },
  { n: 3, id: "prizes", name: "Tickets and prizes", plain: "Choose the tickets and the prizes." },
  { n: 4, id: "brand", name: "Brand & Breaks", optional: true, plain: "Add your company name and message breaks. You can skip this." },
  { n: 5, id: "publish", name: "Check and publish", plain: "Read everything once, then press Publish." },
  { n: 6, id: "pay", name: "Pay", plain: "Pay for the game. The game starts only after you pay." },
];

const all = (v) => Object.fromEntries(STEPS.map((s) => [s.n, v]));
const upTo = (k, v, rest = "") => Object.fromEntries(STEPS.map((s) => [s.n, s.n <= k ? v : rest]));

/**
 * Where a game is on the six steps. `stage` is "create" (choosing a game, step 1 comes next) or the console's one status word of a game row
 * (draft, pending, overdue, paid, free, live, completed, cancelled, deleted). Returns { states: {1..6: "done" | "now" | ""}, now: 0..6, caption }.
 * "now" is always ONE step, or none (a cancelled or deleted game is not on a step). "done" is claimed only where the status proves it:
 * a game that is published has done 1 to 5, a paid game has done 1 to 6. A draft claims nothing done, because the console cannot see inside the game's setup.
 */
export function stepsFor(stage) {
  switch (stage) {
    case "create": return { states: { ...all(""), 1: "now" }, now: 1, caption: "Choose a game below. Its own screen then takes you through these six steps." };
    case "draft": return { states: { ...all(""), 5: "now" }, now: 5, caption: "This game is a draft. Open it, check everything and press Publish (step 5). Then pay (step 6)." };
    case "pending": case "overdue": return { states: { ...upTo(5, "done"), 6: "now" }, now: 6, caption: "Your game is published. The last step is to pay. The game starts only after you pay." };
    case "paid": case "free": case "live": case "completed": return { states: all("done"), now: 0, caption: "All six steps are done." };
    default: return { states: all(""), now: 0, caption: "" }; // cancelled, deleted, or a status this console does not know: nothing is highlighted and nothing is claimed
  }
}

export const TOTAL = STEPS.length;

/**
 * The two plain lines at the top of the banner (0.3.0): where you are, and what is next.
 *   now:  "Step 5 of 6: Check and publish."   (on the Create screen: "Step 1 of 6: Date and time. It starts when you choose a game below.")
 *   next: "Next: Step 6 of 6: Pay."          (on the last step: "Next: nothing more to do here. The game starts after you pay.")
 * Both lines are empty when the game is not on a step (cancelled, deleted, unknown): nothing is claimed.
 */
export function stepSummary(stage) {
  const { now, states } = stepsFor(stage);
  if (!now) {
    return STEPS.every((s) => states[s.n] === "done") ? { now: `All ${TOTAL} steps are done.`, next: "Next: your game runs at its time. Open My games to see it." } : { now: "", next: "" };
  }
  const s = STEPS[now - 1], nx = STEPS[now];
  const nowText = stage === "create" ? `Step ${now} of ${TOTAL}: ${s.name}. It starts when you choose a game below.` : `Step ${now} of ${TOTAL}: ${s.name}.`;
  const nextText = nx ? `Next: Step ${now + 1} of ${TOTAL}: ${nx.name}.` : "Next: nothing more to do here. The game starts after you pay.";
  return { now: nowText, next: nextText };
}

/** one plain line for a game row: "You are at step 6 of 6: Pay. Next: nothing more to do here. ..." (empty when there is nothing to say) */
export function stepLine(stage) {
  const { now, states } = stepsFor(stage);
  if (now) { const nx = STEPS[now]; return `You are at step ${now} of ${TOTAL}: ${STEPS[now - 1].name}. ${nx ? `Next: step ${now + 1}, ${nx.name}.` : "Next: nothing more to do here."}`; }
  return STEPS.every((s) => states[s.n] === "done") ? "All six steps are done." : "";
}

/** the banner: an ordered list of the six steps. The current one is marked with aria-current="step" AND the words "You are here", so colour is never the only sign. */
export function stepBanner(doc, stage, opts = {}) {
  const { states, now, caption } = stepsFor(stage);
  const make = (tag, attrs = {}, text) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
  const nav = make("nav", { class: "stepbanner", "aria-label": "The six steps to run a game", "data-stage": stage, ...(opts.id ? { id: opts.id } : {}) });
  if (opts.title !== false) nav.append(make("h2", { class: "steptitle" }, opts.title || "Six steps to run your game"));
  const ol = make("ol", { class: "steplist" });
  for (const s of STEPS) {
    const st = states[s.n] || "";
    const li = make("li", { class: "step" + (st ? " " + st : ""), "data-step": String(s.n), ...(st === "now" ? { "aria-current": "step" } : {}) });
    li.append(make("span", { class: "stepno", "aria-hidden": "true" }, st === "done" ? "✔" : String(s.n)));
    const txt = make("span", { class: "steptxt" });
    txt.append(make("b", {}, `Step ${s.n}: ${s.name}`), s.optional ? make("i", {}, " (optional)") : "");
    txt.append(make("span", { class: "stepplain" }, s.plain));
    if (st === "now") txt.append(make("span", { class: "stephere" }, stage === "create" ? "Comes next" : "You are here"));
    if (st === "done") txt.append(make("span", { class: "stepdone" }, "Done"));
    li.append(txt); ol.append(li);
  }
  const sum = stepSummary(stage);
  if (sum.now) { // the two lines a person reads first: where you are and what is next (also set as the banner's own description for screen readers)
    const box = make("div", { class: "stepsum", role: "group", "aria-label": "Your place in the six steps" });
    box.append(make("p", { class: "stepnow" }, sum.now), make("p", { class: "stepnext" }, sum.next));
    nav.append(box);
  }
  nav.append(ol);
  if (caption) nav.append(make("p", { class: "stepcap" }, caption));
  return nav;
}
