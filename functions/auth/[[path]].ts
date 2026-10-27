// Cloudflare Pages Function: every /auth/* request. All logic is in functions/_lib/auth-core.ts.
import { handleAuth, type Env } from "../_lib/auth-core";

export const onRequest = async (ctx: { request: Request; env: Env }) => handleAuth(ctx.request, ctx.env, Date.now());
