# Rules 410 tests (independent, tests only)

Run: `bun test --isolate tests/rules-410`. A failing test means the product breaks (or has no code for) that owner rule; product code was not changed to make anything pass.

| Rule | File |
|---|---|
| R1, R2, R3, R4, R5, R6, R7, R8 | games.test.ts |
| R9 | clone.test.ts |
| R10, R13 | retention-wording.test.ts |
| R11 | report-pdf.test.ts |
| R12 | report-send.test.ts |
| S1, S2, S3, S5 (roles matrix: Organizer, Host, Co-host, participant, family pass x Start, Pause, Resume, Copy x 6 games) | roles-matrix.test.ts |
