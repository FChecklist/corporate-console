// Plain sentences for things that go wrong. One game failing never hides the others.
export const couldNotReach = (name) => `${name} is slow, try again.`;
export const gamesFailedLine = (names) => (names.length === 1 ? couldNotReach(names[0]) : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are slow, try again.`);
export const SIGNED_OUT = "Please sign in again.";
export const OPEN_FAILED = "We could not open that game just now. Please try again.";
/** what to tell the person when a hand-over did not work: each cause has its own plain sentence */
export const openError = (r, name) => (r && r.error === "no-key" ? "Please sign in again." : r && r.error === "unreachable" ? `${name} is slow, try again.` : r && (r.error === "not_found" || r.error === "not-on-console") ? `${name} is not open on the console yet.` : OPEN_FAILED);
