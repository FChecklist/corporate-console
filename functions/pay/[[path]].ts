// Cloudflare Pages Function: every /pay/* request (the pay step). All logic is in functions/_lib/pay-core.ts. Dark unless PAY_VIA_MONEYPENNY is "1".
import { handlePay } from "../_lib/pay-core";
import type { Env } from "../_lib/auth-core";

export const onRequest = async (ctx: { request: Request; env: Env & { ASSETS?: { fetch: (r: Request) => Promise<Response> } } }) => handlePay(ctx.request, ctx.env, Date.now(), { assets: ctx.env.ASSETS ? (p) => ctx.env.ASSETS!.fetch(new Request(new URL(p, ctx.request.url))) : undefined });
