# console-wallet (copied, not edited)

`index.js` is a byte copy of `packages/console-wallet/index.js` in the Moneypenny repo (`C:\ct\moneypenny`, master, last change commit `9c1dc5f`).
sha256: `2a5799f42c76a94160ff2823b829881a57108eec25d8b79f702c077673cd8c54`. Do not edit here: change it in the Moneypenny repo, copy again, and update the hash.
Its own tests (29) stay in the Moneypenny repo (`test/consolewallet.test.js`); this repo's tests (`tests/pay-core.test.ts`) test the console's use of it, including the D1 store against its `storeContract`.
Used by `functions/_lib/pay-core.ts`: reserve, capture, then tell the game it is paid (capture first, then grant); a definite refusal by the game returns the credits.
