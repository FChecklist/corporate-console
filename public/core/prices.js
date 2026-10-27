// Prices come from each game's own answer (capabilities), never from numbers written into the console. The game still works out the price again at checkout.
const rs = (minor) => "Rs " + Math.round(minor / 100).toLocaleString("en-IN");

/** caps: the capabilities answer of one game -> { fromInrMinor, freeUpTo, sizes } */
export function priceFacts(caps) {
  const paid = (caps.sizes || []).filter((s) => !s.free).sort((a, b) => a.pack - b.pack);
  return { fromInrMinor: paid.length ? paid[0].inrMinor : null, freeUpTo: caps.freeDemoCap > 0 ? caps.freeDemoCap : 0, sizes: caps.sizes || [] };
}
/** "From Rs 1,493. Free up to 10 people." - the line fixed at the top of the six steps */
export function priceLine(caps) {
  const f = priceFacts(caps);
  const parts = [];
  if (f.fromInrMinor != null) parts.push(`From ${rs(f.fromInrMinor)}.`);
  if (f.freeUpTo > 0) parts.push(`Free up to ${f.freeUpTo} people.`);
  return parts.join(" ");
}
export const rupees = rs;
