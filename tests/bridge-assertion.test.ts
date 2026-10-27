// FALSIFIED BY: bridge-aud-check-removed, bridge-life-extended, bridge-skew-widened, bridge-signature-ignored
import { test, expect } from "bun:test";
import { signAssertion, verifyAssertion, parseKeyList, makeKeyPair, b64uEncode, type Payload } from "../packages/bridge/src/assertion";

const AUD = "https://bingo.corporatetambola.com";
const NOW = 1_800_000_000;
const SUB = "a".repeat(64);
const mk = (o: Partial<Payload> = {}): Payload => ({ v: 1, kid: "k1", aud: AUD, sub: SUB, act: "games", jti: "j".repeat(22), iat: NOW, exp: NOW + 60, ...o });

async function setup() {
  const a = await makeKeyPair(), b = await makeKeyPair();
  const keys = parseKeyList(`k1:${a.publicB64u},k2:${b.publicB64u}`);
  return { a, b, keys };
}

test("a good assertion verifies and the payload comes back", async () => {
  const { a, keys } = await setup();
  const t = await signAssertion(mk(), a.privateKey);
  const v = await verifyAssertion(t, { keys, aud: AUD, nowS: NOW + 5, act: "games" });
  expect(v.ok).toBe(true);
  if (v.ok) expect(v.payload.sub).toBe(SUB);
});

test("a forged signature is refused (signature from another key, or one letter changed)", async () => {
  const { a, b, keys } = await setup();
  const other = await signAssertion(mk(), b.privateKey); // signed by key 2 but says kid k1
  expect((await verifyAssertion(other, { keys, aud: AUD, nowS: NOW })).ok).toBe(false);
  const good = await signAssertion(mk(), a.privateKey);
  const parts = good.split(".");
  const flipped = parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
  const r = await verifyAssertion(`${parts[0]}.${parts[1]}.${flipped}`, { keys, aud: AUD, nowS: NOW });
  expect(r).toEqual({ ok: false, error: "bad_assertion" });
});

test("a changed payload (someone edits the audience) breaks the signature", async () => {
  const { a, keys } = await setup();
  const good = await signAssertion(mk(), a.privateKey);
  const p = good.split(".");
  const edited = b64uEncode(new TextEncoder().encode(JSON.stringify(mk({ aud: "https://evil.example" }))));
  const r = await verifyAssertion(`${p[0]}.${edited}.${p[2]}`, { keys, aud: "https://evil.example", nowS: NOW });
  expect(r).toEqual({ ok: false, error: "bad_assertion" });
});

test("an assertion made for another game is refused (wrong audience)", async () => {
  const { a, keys } = await setup();
  const t = await signAssertion(mk({ aud: "https://tictactoe.corporatetambola.com" }), a.privateKey);
  expect(await verifyAssertion(t, { keys, aud: AUD, nowS: NOW })).toEqual({ ok: false, error: "wrong_audience" });
});

test("time: 30 seconds of clock difference are allowed, 31 are not", async () => {
  const { a, keys } = await setup();
  const t = await signAssertion(mk(), a.privateKey);
  expect((await verifyAssertion(t, { keys, aud: AUD, nowS: NOW + 60 + 30 })).ok).toBe(true);
  expect(await verifyAssertion(t, { keys, aud: AUD, nowS: NOW + 60 + 31 })).toEqual({ ok: false, error: "expired" });
  expect((await verifyAssertion(t, { keys, aud: AUD, nowS: NOW - 30 })).ok).toBe(true);
  expect(await verifyAssertion(t, { keys, aud: AUD, nowS: NOW - 31 })).toEqual({ ok: false, error: "expired" });
});

test("an assertion that lives longer than 60 seconds is refused even if signed", async () => {
  const { a, keys } = await setup();
  const t = await signAssertion(mk({ exp: NOW + 61 }), a.privateKey);
  expect(await verifyAssertion(t, { keys, aud: AUD, nowS: NOW })).toEqual({ ok: false, error: "bad_assertion" });
});

test("unknown key id is refused; both ids work while two keys are live (rotation)", async () => {
  const { a, b, keys } = await setup();
  const unknown = await signAssertion(mk({ kid: "k9" }), a.privateKey);
  expect(await verifyAssertion(unknown, { keys, aud: AUD, nowS: NOW })).toEqual({ ok: false, error: "unknown_kid" });
  const t1 = await signAssertion(mk({ kid: "k1" }), a.privateKey), t2 = await signAssertion(mk({ kid: "k2" }), b.privateKey);
  expect((await verifyAssertion(t1, { keys, aud: AUD, nowS: NOW })).ok).toBe(true);
  expect((await verifyAssertion(t2, { keys, aud: AUD, nowS: NOW })).ok).toBe(true);
  const onlyK2 = keys.filter((k) => k.kid === "k2");
  expect((await verifyAssertion(t1, { keys: onlyK2, aud: AUD, nowS: NOW })).ok).toBe(false);
});

test("an assertion for one purpose cannot be used for another (act)", async () => {
  const { a, keys } = await setup();
  const t = await signAssertion(mk({ act: "billing" }), a.privateKey);
  expect(await verifyAssertion(t, { keys, aud: AUD, nowS: NOW, act: "games" })).toEqual({ ok: false, error: "wrong_act" });
});

test("rubbish in, refusal out: not a string, empty, too long, wrong prefix, bad base64", async () => {
  const { keys } = await setup();
  for (const bad of [null, 5, "", "v1.a.b", "v2.x.y", "x".repeat(3000), "v1.%%%.%%%", {}]) expect((await verifyAssertion(bad, { keys, aud: AUD, nowS: NOW })).ok).toBe(false);
});

test("the key list skips bad entries and never guesses", () => {
  const good = "A".repeat(43);
  expect(parseKeyList(`k1:${good},bad,K2:${good},k3:short,${"k4"}:${good}`).map((k) => k.kid)).toEqual(["k1", "k4"]);
  expect(parseKeyList(undefined)).toEqual([]);
  expect(parseKeyList("")).toEqual([]);
});
