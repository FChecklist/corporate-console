// The cookie banner on the pages that are not the console app (sign-in link page, payee page, games chooser, what's new). The console app starts it from boot.js.
import { startConsent } from "./consent.js";
startConsent();
