// Plain sentences for things that go wrong. One game failing never hides the other five.
export const couldNotReach = (name) => `Could not reach ${name}. Please try again.`;
export const gamesFailedLine = (names) => (names.length === 1 ? couldNotReach(names[0]) + " The other games are shown." : `Could not reach ${names.join(", ")}. The other games are shown.`);
export const SIGNED_OUT = "Please sign in again.";
