// What is kept and for how long, in one place (owner decision 31 Oct 2026, spec 410 section 6). The console itself holds no participant data;
// this table is what every game and the console share so the rules are written once. Customer wording stays on the Terms page only:
// the on-screen line is exactly COPY_LINE and nothing else is added to the screens.
export const HOUR_MS = 3600_000, DAY_MS = 86400_000;

/** shown on screens, word for word */
export const COPY_LINE = "No personal details needed. All participant information is deleted within 24 hours of the game.";

export const RETENTION = Object.freeze({
  /** all participant data (names, e-mails, employee IDs, mobiles, seats, tickets, moves, claims): gone within 24 hours of game over. Tambola's code does it at 20 hours, every game matches that. */
  participantDataHours: 24,
  participantDataCodeHours: 20,
  /** game details (settings, prizes, time, result summary without names) and the WINNERS audit record (ticket or seat ID, employee ID / e-mail / mobile / name, invite chain, prize, tie) */
  gameDetailsDays: 365,
  winnersRecordDays: 365,
  /** organizer and host e-mails: kept for invoices and payment matters */
  organizerHostEmails: "for invoices",
  /** tax records (invoices, payment ledger) are never deleted by the system */
  taxRecords: "never deleted by us",
  /** a saved people list does not exist anywhere */
  savedPeopleList: false,
  /** the end-of-game PDF is not stored. Only a report whose e-mail bounced is held, encrypted, apart from game data: resend after 24 h, 36 h, 72 h, gone by about 96 h. */
  reportHoldMaxHours: 96,
  reportResendAfterHours: [24, 36, 72],
  reportMailWithinHoursOfGameOver: 3,
});

/** when a game's participant data must be gone, counted from game over (the code deadline, which is earlier than the promise) */
export const participantDataDueMs = (gameOverMs: number) => gameOverMs + RETENTION.participantDataCodeHours * HOUR_MS;
/** when the winners record and game details must be deleted */
export const winnersRecordDueMs = (gameOverMs: number) => gameOverMs + RETENTION.winnersRecordDays * DAY_MS;
/** the report must go out before participant data is erased, so its window (3 h) always closes long before the deadline above */
export const reportWindowCloseMs = (gameOverMs: number) => gameOverMs + RETENTION.reportMailWithinHoursOfGameOver * HOUR_MS;
