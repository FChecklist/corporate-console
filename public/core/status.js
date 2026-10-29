// What a game row says, in one place: the Game ID, ONE status pill, the plain banner under it, the role line (who lets whom in) and the buttons the person may press.
// Pure: no network, nothing stored. A status the game's console answer cannot show (paused, refund requested) is not here: the console hides what the engine does not tell it.

export const STATUSES = {
  draft: { label: "Draft", cls: "draft" },
  pending: { label: "Published, payment pending", cls: "pay" },
  paid: { label: "Published and paid", cls: "ready" },
  free: { label: "Published, free game", cls: "ready" },
  overdue: { label: "Payment pending, start time passed", cls: "nostart" },
  live: { label: "Live now", cls: "live" },
  completed: { label: "Completed", cls: "done" },
  cancelled: { label: "Cancelled", cls: "cancel" },
  deleted: { label: "Data deleted", cls: "cancel" },
};

/** the ONE status of a game row (the row's own status word, its payment and its start time) */
export function rowStatus(g, now = Date.now()) {
  if (g.erased === true) return "deleted";
  const late = g.startMs != null && g.startMs <= now;
  switch (g.status) {
    case "cancelled": return "cancelled";
    case "draft": return "draft";
    case "waiting_payment": return late ? "overdue" : "pending";
    case "not_started": return "overdue";
    case "ready": return g.payment && g.payment.state === "free" ? "free" : "paid";
    case "playing": return "live";
    case "finished": return "completed";
    default: return "draft";
  }
}

const HELPER_WORDS = { organizer: false, host: true, cohost: true };
/** the plain banner under the pill. `when` is the start time already written in words. A Host or Co-host is never told to pay or to cancel: that is the organizer's. */
export function bannerFor(status, g, when) {
  const helper = HELPER_WORDS[g.role] === true;
  switch (status) {
    case "draft": return helper ? "This game is a draft. Nobody can join yet." : "Saved as a draft. Nobody can join yet. Finish the steps and press Publish.";
    case "pending": return helper ? "Published, payment is pending. The organizer pays. The game will not start until the payment is done." : "Published, payment is pending. Don’t worry. The game will not start until the payment is done, and you can cancel it at any time.";
    case "paid": return helper ? "The game is on. It will begin at " + when + "." : "Congratulations, your game is on! It will begin at " + when + ". Don’t worry if you want to postpone or change anything: you can do it up to 5 minutes before the game begins.";
    case "free": return helper ? "The game is on. It is a free game. It will begin at " + when + "." : "Congratulations, your game is on! It is a free game. It will begin at " + when + ". Don’t worry if you want to postpone or change anything: you can do it up to 5 minutes before the game begins.";
    case "overdue": return helper ? "Payment is pending and the start time has passed, so the game has not started. The organizer decides what to do." : "Payment is pending and the start time has passed, so the game has not started. Pay now, change the date, or cancel it.";
    case "live": return "The game is live now. The participants are playing.";
    case "completed": return "Thank you for playing! The report was also sent to the organizer’s email. It can be downloaded within 24 hours.";
    case "cancelled": return "This game was cancelled. Nothing is charged.";
    case "deleted": return "The information of this game has been deleted. Only the Game ID and the payment record remain.";
    default: return "";
  }
}

/** who lets people in, in plain words, for the role this person has (only what the engine does today: the organizer and the Hosts let in people who are not on the list) */
export const ROLE_LINE = {
  organizer: "You let in the people who are not on your list. Your Hosts can help.",
  host: "You help the organizer. You and the organizer let in the people who are not on the list.",
  cohost: "You help bring people. The organizer and the Hosts let in the people who are not on the list.",
};
export const roleLine = (role) => ROLE_LINE[role] || "";

/** the buttons a row may have. id = what happens; target = which page of the game opens. */
export function rowActions(g, caps = {}, status = rowStatus(g)) {
  const out = [], mine = g.role === "organizer";
  if (g.nextAction === "accept") {
    if (g.roleId) out.push({ id: "accept", label: "Accept", main: true }, { id: "decline", label: "Decline" });
    else out.push({ id: "open-in-game" });
    return out;
  }
  const results = ["finished", "not_started", "cancelled"].includes(g.status);
  out.push({ id: "open", label: results ? "Results and game log" : "Open", main: true });
  if (mine && status === "draft") out.push({ id: "publish", label: "Publish", target: "publish" });
  if (mine && (status === "pending" || status === "overdue")) out.push({ id: "pay", label: "Pay now", target: "pay" });
  if (caps && caps.features && caps.features.preview) out.push({ id: "preview", label: "See what players see" });
  if (mine && status !== "deleted") out.push({ id: "copy", label: "Make a copy" });
  if (mine && status === "draft") out.push({ id: "delete-draft", label: "Delete draft", danger: true });
  return out;
}

/** the entry for a game's new organizer screens (Corporate Tambola only, until another game has them): its address, or null */
export function newScreensLink(game) {
  if (!game || game.id !== "tambola" || !game.newScreens || !game.origin) return null;
  return { href: game.origin + game.newScreens, label: "Try the new organizer screens" };
}

/** who lets someone in, by the kind of link they came with. Only what the engine does today is told: a person on the list needs nothing else; a person who is not on the list waits for the organizer or a Host.
    Co-host approval, family passes and the open-join form are not in the engine yet: null = nothing is shown about them. */
export const LINK_TYPES = ["organizer-link", "host-link", "cohost-link", "open-link", "family-link"];
export function approverFor(linkType) {
  if (linkType === "organizer-link" || linkType === "host-link") return "The organizer or a Host lets in a person who is not on the list.";
  return null;
}
/** the two lines My games shows under its title */
export const approvalNote = () => ["A person who is on your list comes in with nothing else.", approverFor("organizer-link")];
