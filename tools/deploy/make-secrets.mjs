// node tools/deploy/make-secrets.mjs
// Makes the two secrets the console needs that nobody has to be asked for: a NEW signing key (Ed25519) and a NEW session pepper. Prints them ONCE on the screen. Nothing is saved, sent or written to a file.
// You paste each one into the matching `wrangler ... secret put` prompt. The public half (k1:...) is what every game later gets as CONSOLE_PUBKEYS.
// RESEND_API_KEY is NOT made here: it belongs to the owner's Resend account and only the owner can give it.
import { pathToFileURL } from "node:url";

const b64 = (u8) => Buffer.from(u8).toString("base64");
const b64u = (u8) => b64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function makeSecrets() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const pepper = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  return { CONSOLE_SIGNING_KEY: b64(pkcs8), SESSION_PEPPER: pepper, publicKeyForGames: "k1:" + b64u(pub) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await makeSecrets();
  console.log("Shown once. Not saved anywhere. Paste each into its own wrangler prompt.");
  console.log("CONSOLE_SIGNING_KEY=" + s.CONSOLE_SIGNING_KEY);
  console.log("SESSION_PEPPER=" + s.SESSION_PEPPER);
  console.log("CONSOLE_PUBKEYS for the games (public, safe to share) = " + s.publicKeyForGames);
}
