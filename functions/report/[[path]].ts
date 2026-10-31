// Cloudflare Pages Function: every /report/* request (the end-of-game report). All logic is in functions/_lib/report-core.ts.
import { handleReport, lazyReportRetry } from "../_lib/report-core";
import type { Env } from "../_lib/auth-core";

export const onRequest = async (ctx: { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void }) => {
  const now = Date.now();
  const res = await handleReport(ctx.request, ctx.env, now);
  if (ctx.waitUntil) ctx.waitUntil(lazyReportRetry(ctx.env, now).then(() => undefined, () => undefined)); // resends of held reports are due at most once an hour
  return res;
};
