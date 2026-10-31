// Cloudflare Pages Function: every /stats/* request (funnel events in, owner numbers out). All logic is in functions/_lib/stats-core.ts.
import { handleStats, lazyStatsPurge } from "../_lib/stats-core";
import type { Env } from "../_lib/auth-core";

export const onRequest = async (ctx: { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void }) => {
  const now = Date.now();
  const res = await handleStats(ctx.request, ctx.env, now);
  if (ctx.waitUntil) ctx.waitUntil(lazyStatsPurge(ctx.env, now));
  return res;
};
