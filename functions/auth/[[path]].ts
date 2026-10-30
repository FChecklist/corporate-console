// Cloudflare Pages Function: every /auth/* request. All logic is in functions/_lib/auth-core.ts.
// The daily clean-up (functions/_lib/purge.ts) normally runs from the cron Worker. Where that Worker cannot be deployed, the first page load or sign-in after the day is up does it, in the background (lazyPurge: once a day, never slows the answer).
import { handleAuth, type Env } from "../_lib/auth-core";
import { lazyPurge } from "../_lib/purge";

export const onRequest = async (ctx: { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void }) => {
  const now = Date.now();
  const res = await handleAuth(ctx.request, ctx.env, now);
  const path = new URL(ctx.request.url).pathname.replace(/\/+$/, "");
  if (ctx.waitUntil && ((ctx.request.method === "GET" && path === "/auth/me") || (ctx.request.method === "POST" && path === "/auth/request"))) {
    ctx.waitUntil(lazyPurge(ctx.env, now).then(() => undefined, () => undefined)); // a clean-up that fails must never be seen by the person
  }
  return res;
};
