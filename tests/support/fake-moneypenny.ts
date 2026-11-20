// A local stand-in for Moneypenny's game-pay routes (contract/v1/openapi.json, branch game-pay-chain; shapes taken from its src/gamepay.js). NO money, NO network.
// Rate here is a test number only: 1 credit = 1 US cent = 70 paise. The console must never know it: every figure it shows comes from these answers.
// The game id is the order reference (order_ref). A shortfall buys the smallest listed pack that covers it.
export type Fake = ReturnType<typeof makeFakeMoneypenny>;
type Game = { ref: string; email: string; product: string; item: string; credits: number; status: "open" | "paid" | "review"; orderId: string | null; payer: string | null; paidSource: string | null };
export function makeFakeMoneypenny(o: { packs?: number[]; catalogue?: Array<{ product: string; item: string; credits: number }>; resize?: boolean } = {}) {
  const accounts = new Map<string, number>();
  const games = new Map<string, Game>();
  const orders = new Map<string, { id: string; ref: string; credits: number; amountMinor: number; status: "awaiting_payment" | "paid" }>();
  const links = new Map<string, string>(); // token -> game ref
  const packs = o.packs ?? [1000, 2000, 3000, 5000, 10000];
  const catalogue = o.catalogue ?? [{ product: "tambola", item: "100", credits: 3400 }, { product: "tambola", item: "250", credits: 5000 }, { product: "bingo", item: "100", credits: 3400 }, { product: "bingo", item: "250", credits: 5000 }, { product: "luckydraw", item: "100", credits: 2000 }];
  const state = { down: false, calls: [] as string[], bodies: [] as any[], badSignature: false };
  const ok = (body: any = {}, status = 200) => ({ status, body: { ok: true, ...body } });
  const bad = (status: number, code: string, extra: any = {}) => ({ status, body: { ok: false, error: { code, message: "text the console must not show: " + code }, ...extra } });
  const q = (p: string) => new URL("http://x" + p).searchParams;
  const pathOf = (p: string) => p.split("?")[0];
  const em = (e: unknown) => String(e).toLowerCase();
  let n = 0;
  const price = (product: string, item: string) => catalogue.find((c) => c.product === product && c.item === item)?.credits;
  const packFor = (short: number) => packs.filter((p) => p >= short).sort((a, b) => a - b)[0] ?? null;
  const view = (g: Game | undefined) => {
    if (!g) return { status: "unknown", paid: false };
    const ord = g.orderId ? orders.get(g.orderId) : null;
    const waiting = ord && ord.status === "awaiting_payment";
    return { order_ref: g.ref, status: g.status === "open" && waiting ? "awaiting_payment" : g.status, paid: g.status === "paid", product: g.product, item: g.item, credits: g.credits, order: ord ? { order_id: ord.id, status: ord.status, credits: ord.credits, currency: "INR", amount_minor: ord.amountMinor, ...(waiting ? { payframe: { key: "rzp_test_stub", order_id: "order_" + ord.id, amount: ord.amountMinor, currency: "INR" } } : {}) } : null };
  };
  const trySettle = (g: Game, source: string) => {
    if (g.status === "paid") return;
    const have = accounts.get(g.email) ?? 0;
    if (have < g.credits) return;
    accounts.set(g.email, have - g.credits); g.status = "paid"; g.paidSource = source;
  };
  const event = (g: Game) => ({ id: "ev_" + g.ref, type: "game.paid", created_at: Date.now(), data: { game_ref: g.ref, product: g.product, item: g.item, credits: g.credits, hold_id: "h_" + g.ref, account_id: "acc", source: g.paidSource, paid_at: Date.now() } });
  const openOrder = (g: Game, payer: string | null) => {
    const short = g.credits - (accounts.get(g.email) ?? 0);
    const pack = packFor(short);
    if (!pack) return bad(422, "no_pack_covers", { short_by: short });
    const prior = g.orderId ? orders.get(g.orderId) : null;
    if (!(prior && prior.status === "awaiting_payment" && prior.credits === pack)) { const id = "ord" + ++n; orders.set(id, { id, ref: g.ref, credits: pack, amountMinor: pack * 70, status: "awaiting_payment" }); g.orderId = id; }
    g.payer = payer;
    return null;
  };
  const mnp = {
    get: async (p: string) => {
      state.calls.push("GET " + pathOf(p)); if (state.down) throw new Error("down");
      const s = q(p);
      switch (pathOf(p)) {
        case "/v1/quote": { const c = Number(s.get("credits")); return Number.isSafeInteger(c) && c > 0 ? ok({ credits: c, usd: (c / 100).toFixed(2), usd_minor: c, inr_minor: c * 70, pay_in: ["INR", "USD"] }) : bad(400, "bad_request"); }
        case "/v1/game_pay/quote": {
          const ref = String(s.get("order_ref")); const g = games.get(ref);
          const product = g?.product ?? String(s.get("product")), item = g?.item ?? String(s.get("item")), email = g?.email ?? em(s.get("email"));
          const cost = price(product, item); if (cost === undefined) return bad(404, "no_item");
          const have = accounts.get(email) ?? 0, short = g?.status === "paid" ? 0 : Math.max(0, cost - have), pack = short > 0 ? packFor(short) : null;
          return ok({ ...view(g), order_ref: ref, product, item, cost_credits: cost, cost_text: "x", cost_usd: (cost / 100).toFixed(2), cost_inr_minor: cost * 70, balance: have, balance_text: "x", short_by: short, to_buy: pack ? { credits: pack, currency: "INR", amount_minor: pack * 70, text: "x", in: ["INR", "USD"] } : null, can_pay_now: short <= 0 && g?.status !== "paid" });
        }
        case "/v1/game_pay/status": return ok(view(games.get(String(s.get("order_ref")))));
        case "/v1/game_pay/link": {
          const ref = links.get(String(s.get("token"))); const g = ref ? games.get(ref) : undefined;
          if (!g) return bad(404, "no_link");
          if (g.status === "paid") return ok({ status: "paid", order_ref: g.ref, product: g.product, item: g.item });
          const short = g.credits - (accounts.get(g.email) ?? 0);
          if (short <= 0) return ok({ status: "nothing_due", order_ref: g.ref, product: g.product, item: g.item });
          const pack = packFor(short); if (!pack) return bad(422, "no_pack_covers");
          return ok({ status: "open", order_ref: g.ref, product: g.product, item: g.item, amount_minor: pack * 70, currency: "INR", amount_text: "Rs x", expires_at: Date.now() + 72 * 3600_000 });
        }
      }
      return bad(404, "no_route");
    },
    post: async (p: string, b: any) => {
      state.calls.push("POST " + p); state.bodies.push({ p, b }); if (state.down) throw new Error("down");
      if (p === "/v1/game_pay/start") {
        const cost = price(b.product, b.item); if (cost === undefined) return bad(404, "no_item");
        if (b.credits != null && b.credits !== cost) return bad(409, "price_changed", { price_credits: cost });
        let g = games.get(b.order_ref);
        if (g && o.resize && g.email === em(b.email) && g.product === b.product && g.item !== b.item && g.status === "open") { g.item = b.item; g.credits = cost; g.orderId = null; } // a Moneypenny that lets an unpaid game change its size (test option)
        if (g && (g.email !== em(b.email) || g.product !== b.product || g.item !== b.item)) return bad(409, "game_ref_used");
        if (!g) { g = { ref: b.order_ref, email: em(b.email), product: b.product, item: b.item, credits: cost, status: "open", orderId: null, payer: null, paidSource: null }; games.set(g.ref, g); }
        if (g.status === "paid") return ok(view(g));
        g.credits = cost; trySettle(g, "console");
        if (g.status !== "paid") { const e = openOrder(g, null); if (e) return e; }
        return ok(view(g));
      }
      if (p === "/v1/game_pay/confirm") {
        const g = games.get(b.order_ref); if (!g) return bad(404, "no_game");
        const ord = orders.get(b.order_id); if (!ord || ord.ref !== g.ref) return bad(404, "no_order");
        if (ord.status === "paid") return ok({ ...view(g), payment: { already: true } });
        if (state.badSignature || b.razorpay_signature !== "sig_ok") return ok({ ...view(g), paid: false, payment: { verified: false } });
        ord.status = "paid"; accounts.set(g.email, (accounts.get(g.email) ?? 0) + ord.credits); trySettle(g, g.payer ? "paylink" : "console");
        return ok({ ...view(g), credited: ord.credits, payment: { already: false } });
      }
      if (p === "/v1/game_pay/link") {
        const cost = price(b.product, b.item); if (cost === undefined) return bad(404, "no_item");
        let g = games.get(b.order_ref);
        if (g && g.status === "paid") return bad(409, "already_paid");
        if (!g) { g = { ref: b.order_ref, email: em(b.email), product: b.product, item: b.item, credits: cost, status: "open", orderId: null, payer: null, paidSource: null }; games.set(g.ref, g); }
        const token = "tok" + ++n + "x".repeat(40);
        for (const [t, r] of [...links]) if (r === g.ref) links.delete(t);
        links.set(token, g.ref);
        return ok({ order_ref: g.ref, token, expires_at: Date.now() + 72 * 3600_000 });
      }
      if (p === "/v1/game_pay/link/start") {
        const ref = links.get(String(b.token)); const g = ref ? games.get(ref) : undefined; if (!g) return bad(404, "no_link");
        if (g.status === "paid") return bad(409, "already_paid");
        const e = openOrder(g, em(b.payer_email)); if (e) return e;
        const v: any = view(g); return ok({ order_ref: g.ref, status: v.status, order: v.order && { order_id: v.order.order_id, status: v.order.status, currency: v.order.currency, amount_minor: v.order.amount_minor, payframe: v.order.payframe ?? null } });
      }
      return bad(404, "no_route");
    },
  };
  return {
    mnp, state, accounts, games, orders, links,
    give: (email: string, credits: number) => accounts.set(em(email), (accounts.get(em(email)) ?? 0) + credits),
    /** the payer finished in the secure window and Moneypenny heard about it from the payment side (the push path): credits in, game paid, and the signed notice body the game's endpoint gets */
    complete: (ref: string) => { const g = games.get(ref)!; const ord = orders.get(g.orderId!)!; ord.status = "paid"; accounts.set(g.email, (accounts.get(g.email) ?? 0) + ord.credits); trySettle(g, g.payer ? "paylink" : "console"); return event(g); },
    /** what the secure window hands back to the page after a payment */
    windowAnswer: (orderId: string) => ({ razorpay_order_id: "order_" + orderId, razorpay_payment_id: "pay_" + orderId, razorpay_signature: "sig_ok" }),
  };
}
