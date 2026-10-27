// Daily clean-up Worker for the console (Cloudflare cron trigger): old codes, sessions, rate counters, and e-mails past day 365.
import { purgeExpired } from "../../../functions/_lib/purge";
import type { Env } from "../../../functions/_lib/auth-core";

export default {
  async scheduled(_e: unknown, env: Env) {
    const r = await purgeExpired(env, Date.now());
    console.log(JSON.stringify({ purge: r })); // counts only, no e-mail addresses
  },
};
