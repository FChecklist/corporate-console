// Cloudflare Pages Function: GET /api/me (who is signed in; used by Home and the games). All logic is in functions/_lib/me-core.ts.
import { handleMe } from "../_lib/me-core";
import type { Env } from "../_lib/auth-core";

export const onRequest = async (ctx: { request: Request; env: Env }) => handleMe(ctx.request, ctx.env, Date.now());
