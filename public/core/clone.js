// "Start from an earlier game?" (spec 410 section 2): what a new game takes from an old one, in one place. Pure: no network, nothing stored.
// Copied: settings, start mode, prize plan, role setup (how many Hosts, who can bring people), look (brand). NEVER copied: the people list, the time, results, play data, names, e-mails, IDs.
// Works across all six game types: a setting the new game type does not have is dropped, and the step that held it is skipped ("Steps that do not apply are skipped when the type changes").

/** the parts of an earlier game that may be copied, and the step of the new-game flow each one fills */
export const COPY_PARTS = Object.freeze([
  { key: "settings", step: "Who is this game for", label: "Settings" },
  { key: "startMode", step: "Date and time", label: "Start mode" },
  { key: "prizePlan", step: "Tickets and prizes", label: "Prize plan" },
  { key: "roles", step: "Who is this game for", label: "Roles" },
  { key: "look", step: "Brand & Breaks", label: "Look" },
]);

const NEVER = /(emails?|emp(?:ids?|loyee\w*)|mobiles?|phones?|participants?|people|persons?|names?|winners?|results?|claims?|moves|seats|log|list|time|Ms)$/i; // a key ENDING like this is personal or time-bound (hostEmails, startMs, peopleList ...)

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** deep copy that drops anything personal or time-bound by its key name, so a game that adds a new field can never leak one through by accident */
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (!isPlain(v)) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!NEVER.test(k)) out[k] = scrub(x);
  return out;
}

/**
 * @param old  an earlier game as its console answer gives it: { gameType, settings, startMode, prizePlan, roles, look, ... }
 * @param target  the new game's type descriptor: { id, startModes: [...], settingKeys?: [...], features?: [...] }
 * @returns { copy, skipped, sources } copy = the fields for the new game; skipped = steps with nothing to copy; sources = per step "Copied from <game>" for the review screen
 */
export function cloneFrom(old, target) {
  const copy = {}, skipped = [], sources = {};
  const name = (old && (old.gameName || old.title || old.gameId)) || "an earlier game";
  if (!old || !target) return { copy, skipped: COPY_PARTS.map((p) => p.step), sources };
  const sameType = old.gameType === target.id;
  for (const part of COPY_PARTS) {
    let val = old[part.key];
    if (val === undefined || val === null) { skipped.push(part.step); continue; }
    if (part.key === "startMode" && Array.isArray(target.startModes) && !target.startModes.includes(val)) { skipped.push(part.step); continue; } // that way of starting does not exist in the new game
    if (part.key === "settings" && isPlain(val)) {
      val = scrub(val);
      if (!sameType && Array.isArray(target.settingKeys)) val = Object.fromEntries(Object.entries(val).filter(([k]) => target.settingKeys.includes(k)));
      if (!Object.keys(val).length) { skipped.push(part.step); continue; }
    } else if (part.key === "prizePlan" && !sameType) { skipped.push(part.step); continue; // prize positions belong to one game's rules: another type chooses its own
    } else if (part.key !== "look" && (isPlain(val) || Array.isArray(val))) val = scrub(val); // the look (company name, logo, colours) is brand, not personal data
    copy[part.key] = val;
    sources[part.step] = "Copied from " + name;
  }
  return { copy, skipped: [...new Set(skipped)].filter((s) => !sources[s]), sources };
}
