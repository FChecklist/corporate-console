// Plain sentences for things that go wrong. One game failing never hides the others.
// Rule (0.2.2): every sentence says what to do next. A test reads this folder and fails on an error sentence with no next step.
export const HELP_EMAIL = "hello@corporatetambola.com";
export const notOpenYet = (name) => `${name} is not open on the console yet. Please choose another game, or write to ${HELP_EMAIL}.`;
export const couldNotReach = (name) => `${name} is slow, try again.`;
export const gamesFailedLine = (names) => (names.length === 1 ? couldNotReach(names[0]) : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are slow, try again.`);
export const SIGNED_OUT = "Please sign in again.";
export const OPEN_FAILED = "The system could not open that game just now. Please try again.";
/** what to tell the person when a hand-over did not work: each cause has its own plain sentence */
export const openError = (r, name) => (r && r.error === "no-key" ? "Please sign in again." : r && r.error === "unreachable" ? `${name} is slow, try again.` : r && (r.error === "not_found" || r.error === "not-on-console") ? notOpenYet(name) : OPEN_FAILED);
