// A small PDF writer with no dependencies (runs in a Cloudflare Pages Function). A4 pages, the two standard fonts (Helvetica and Helvetica-Bold, so nothing is embedded),
// filled rectangles, lines, one optional JPEG, and "Page x of y". Text is Latin-1 (WinAnsi): a character outside it is drawn as "?".
// The report layout lives in report.ts; this file only knows how to put marks on pages.

export const A4 = { w: 595.28, h: 841.89 };
export type Rgb = [number, number, number];
export const rgb = (hex: string, fallback: Rgb = [0.1, 0.1, 0.1]): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  return m ? [parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255] : fallback;
};

// Helvetica character widths for codes 32..126 (units of 1/1000 em). Bold is drawn a little wider.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

/** Latin-1 safe text: keeps printable ASCII and a few typographic marks, everything else becomes "?" */
export const latin1 = (s: string): string => String(s == null ? "" : s).normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e·–’]/g, "?").replace(/·/g, "\xb7").replace(/–/g, "\x96").replace(/’/g, "\x92");
export const textWidth = (s: string, size: number, bold = false): number => {
  let w = 0;
  for (const ch of latin1(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? W[c - 32] : 500; }
  return (w / 1000) * size * (bold ? 1.06 : 1);
};
/** Cuts text into lines that fit `width` points, breaking at spaces (a single word longer than the line is cut). Never drops a character. */
export function wrap(s: string, width: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of latin1(s).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      let wd = word;
      const t = line ? line + " " + wd : wd;
      if (textWidth(t, size, bold) <= width) { line = t; continue; }
      if (line) { out.push(line); line = ""; }
      while (textWidth(wd, size, bold) > width && wd.length > 1) {
        let k = wd.length - 1; while (k > 1 && textWidth(wd.slice(0, k), size, bold) > width) k--;
        out.push(wd.slice(0, k)); wd = wd.slice(k);
      }
      line = wd;
    }
    out.push(line);
  }
  return out;
}

const esc = (s: string) => latin1(s).replace(/[\\()]/g, (c) => "\\" + c);
const n2 = (n: number) => (Math.round(n * 100) / 100).toString();
const col = (c: Rgb) => c.map((v) => n2(v)).join(" ");

type Jpeg = { data: Uint8Array; w: number; h: number; name: string };
export function readJpeg(b64: string | undefined, name: string): Jpeg | null {
  if (!b64) return null;
  let bin: string; try { bin = atob(b64); } catch { return null; }
  const d = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) { i++; continue; }
    const m = d[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { data: d, h: (d[i + 5] << 8) | d[i + 6], w: (d[i + 7] << 8) | d[i + 8], name };
    i += 2 + ((d[i + 2] << 8) | d[i + 3]);
  }
  return null;
}

export class Doc {
  pages: string[][] = [];
  images: Jpeg[] = [];
  cur: string[] = [];
  constructor() { this.addPage(); }
  addPage() { this.cur = []; this.pages.push(this.cur); }
  addImage(j: Jpeg) { this.images.push(j); }
  rect(x: number, y: number, w: number, h: number, fill: Rgb) { this.cur.push(`${col(fill)} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`); }
  frame(x: number, y: number, w: number, h: number, stroke: Rgb, lw = 0.6) { this.cur.push(`${col(stroke)} RG ${n2(lw)} w ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re S`); }
  line(x1: number, y1: number, x2: number, y2: number, stroke: Rgb, lw = 0.6) { this.cur.push(`${col(stroke)} RG ${n2(lw)} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`); }
  text(x: number, y: number, s: string, size: number, color: Rgb = [0.1, 0.1, 0.1], bold = false) {
    this.cur.push(`BT /${bold ? "F2" : "F1"} ${n2(size)} Tf ${col(color)} rg ${n2(x)} ${n2(y)} Td (${esc(s)}) Tj ET`);
  }
  image(name: string, x: number, y: number, w: number, h: number) { this.cur.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(y)} cm /${name} Do Q`); }

  /** After all pages are drawn: `onEachPage(doc, pageIndex, total)` draws headers and footers, then the file is built. */
  build(onEachPage?: (d: Doc, i: number, total: number) => void): Uint8Array {
    const total = this.pages.length;
    if (onEachPage) for (let i = 0; i < total; i++) { this.cur = this.pages[i]; onEachPage(this, i, total); }
    const parts: Uint8Array[] = [];
    const offs: number[] = [];
    let len = 0;
    const put = (s: string | Uint8Array) => { const u = typeof s === "string" ? Uint8Array.from(s, (c) => c.charCodeAt(0) & 255) : s; parts.push(u); len += u.length; };
    const obj = (id: number, body: string | (() => void)) => { offs[id] = len; put(`${id} 0 obj\n`); if (typeof body === "string") put(body); else body(); put("\nendobj\n"); };
    // object numbers: 1 catalog, 2 pages, 3 F1, 4 F2, then images, then (page, content) pairs
    const imgBase = 5, pageBase = imgBase + this.images.length;
    put("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Count ${total} /Kids [${this.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(" ")}] >>`);
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    this.images.forEach((im, i) => obj(imgBase + i, () => { put(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`); put(im.data); put("\nendstream"); }));
    const xo = this.images.length ? ` /XObject << ${this.images.map((im, i) => `/${im.name} ${imgBase + i} 0 R`).join(" ")} >>` : "";
    this.pages.forEach((ops, i) => {
      const stream = ops.join("\n");
      obj(pageBase + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> /Contents ${pageBase + i * 2 + 1} 0 R >>`);
      obj(pageBase + i * 2 + 1, () => { put(`<< /Length ${stream.length} >>\nstream\n`); put(stream); put("\nendstream"); });
    });
    const count = pageBase + total * 2;
    const xref = len;
    put(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let id = 1; id < count; id++) put(String(offs[id]).padStart(10, "0") + " 00000 n \n");
    put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let p = 0;
    for (const u of parts) { out.set(u, p); p += u.length; }
    return out;
  }
}
