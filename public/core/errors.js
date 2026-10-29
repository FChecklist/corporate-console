// Plain sentences for things that go wrong. One game failing never hides the others.
export const couldNotReach = (name) => `${name} is slow, try again.`;
export const gamesFailedLine = (names) => (names.length === 1 ? couldNotReach(names[0]) : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are slow, try again.`);
export const SIGNED_OUT = "Please sign in again.";
export const OPEN_FAILED = "We could not open that game just now. Please try again.";
