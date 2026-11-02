// Cloudflare Pages Function: every /api/control/* request (Mission Control, read only). All logic is in functions/_lib/control-core.ts.
import { handleControl, type ControlEnv } from "../../_lib/control-core";

export const onRequest = async (ctx: { request: Request; env: ControlEnv }) => handleControl(ctx.request, ctx.env, Date.now());
