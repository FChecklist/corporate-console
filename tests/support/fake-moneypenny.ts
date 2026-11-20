// A local stand-in for Moneypenny's routes that the console's pay step uses (contract/v1/openapi.json shapes). NO money, NO network.
// Rate here is a test number only: 1 credit = 1 US cent = 70 paise. The console must never know it: every figure it shows comes from these answers.
export type Fake = ReturnType<typeof makeFakeMoneypenny>;
export function makeFakeMoneypenny(o: { catalogue?: Array<{ product: string; item: string; credits: number }> } = {}) {
  const accounts = new Map<string, number>();
  const holds = new Map<string, { id: string; email: string; credits: number; ref: string; state: "open" | "captured" | "returned" }>();
  const orders = new Map<string, { ref: string; email: string; credits: number; product: string; item: string; gameId: string; status: "awaiting_payment" | "paid" }>();
  const catalogue = o.catalogue ?? [{ product: "tambola", item: "100", credits: 3400 }, { product: "tambola", item: "250", credits: 5000 }, { product: "bingo", item: "100", credits: 3400 }, { product: "luckydraw", item: "100", credits: 2000 }];
  const state = { down: false, calls: [] as string[], slowReserve: false };
  const ok = (body: any = {}, status = 200) => ({ status, body: { ok: true, ...body } });
  const bad = (status: number, code: string, extra: any = {}) => ({ status, body: { ok: false, error: { code, message: code }, ...extra } });
  const q = (p: string) => new URL("http://x" + p).searchParams;
  const pathOf = (p: string) => p.split("?")[0];
  let n = 0;
  const mnp = {
    get: async (p: string) => {
      state.calls.push("GET " + pathOf(p)); if (state.down) throw new Error("down");
      const s = q(p);
      switch (pathOf(p)) {
        case "/v1/catalogue": return ok({ items: catalogue.filter((c) => !s.get("product") || c.product === s.get("product")) });
        case "/v1/balance": { const b = accounts.get(String(s.get("email")).toLowerCase()) ?? 0; return ok({ balance: b, display: { label: "Moneypenny", symbol: "MC", unit: "credits", credits: b, usd: (b / 100).toFixed(2) } }); }
        case "/v1/quote": { const c = Number(s.get("credits")); return Number.isSafeInteger(c) && c > 0 ? ok({ credits: c, usd: (c / 100).toFixed(2), usd_minor: c, inr_minor: c * 70, pay_in: ["INR", "USD"] }) : bad(400, "bad_request"); }
        case "/v1/game_order": { const r = orders.get(String(s.get("order_ref"))); return r ? ok({ status: r.status }) : bad(404, "no_order"); }
      }
      return bad(404, "no_route");
    },
    post: async (p: string, b: any) => {
      state.calls.push("POST " + p); if (state.down) throw new Error("down");
      if (p === "/v1/spend/reserve_item") {
        const price = catalogue.find((c) => c.product === b.product && c.item === b.item)?.credits;
        if (price === undefined) return bad(404, "no_item");
        const same = [...holds.values()].find((h) => h.ref === b.order_ref);
        if (same) return same.state === "open" ? bad(409, "order_has_open_hold") : bad(409, "order_already_paid_with_credits");
        const have = accounts.get(String(b.email).toLowerCase()) ?? 0;
        if (have < price) return bad(402, "insufficient_credits", { price_credits: price, usable_credits: have, short_by: price - have });
        accounts.set(String(b.email).toLowerCase(), have - price);
        const h = { id: "h" + ++n, email: String(b.email).toLowerCase(), credits: price, ref: b.order_ref, state: "open" as const }; holds.set(h.id, h);
        return ok({ hold_id: h.id, credits: price });
      }
      if (p === "/v1/spend/capture") { const h = holds.get(b.hold_id); if (!h) return bad(404, "no_hold"); if (h.state === "captured") return bad(409, "hold_already_captured"); h.state = "captured"; return ok({ status: "captured" }); }
      if (p === "/v1/refund") { const h = holds.get(b.hold_id); if (!h || h.state === "returned") return bad(409, "nothing_to_return"); h.state = "returned"; accounts.set(h.email, (accounts.get(h.email) ?? 0) + h.credits); return ok({ returned_credits: h.credits }); }
      if (p === "/v1/buy_credits") {
        const ex = orders.get(b.order_ref);
        if (!ex) orders.set(b.order_ref, { ref: b.order_ref, email: String(b.email).toLowerCase(), credits: b.credits, product: b.product, item: b.item, gameId: b.game_id, status: "awaiting_payment" });
        const r = orders.get(b.order_ref)!;
        return ok({ order_id: "ord_" + b.order_ref, order_ref: b.order_ref, status: r.status, credits: r.credits, currency: "INR", amount_minor: r.credits * 70, pay_url: "https://pay.invalid/stub/" + b.order_ref });
      }
      return bad(404, "no_route");
    },
  };
  return {
    mnp, state, accounts, holds, orders,
    give: (email: string, credits: number) => accounts.set(email.toLowerCase(), (accounts.get(email.toLowerCase()) ?? 0) + credits),
    /** the payment company confirmed: Moneypenny credits the account, takes the game's price for the game, and (in the real thing) sends a signed notice */
    complete: (ref: string) => { const r = orders.get(ref)!; r.status = "paid"; return { event_id: "ev_" + ref, type: "game.paid", product: r.product, item: r.item, game_id: r.gameId, order_ref: ref }; },
  };
}
