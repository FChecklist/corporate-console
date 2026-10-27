"""Pulls the rules for a list of component classes out of the approved laptop mockup so the real console looks like it. Usage: python tools/extract-css.py <mockup html> <out css> class1 class2 ..."""
import re, sys
html = open(sys.argv[1], encoding="utf8").read()
css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
want = sys.argv[3:]
def split_rules(text):
    out, depth, cur = [], 0, ""
    for ch in text:
        cur += ch
        if ch == "{": depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0: out.append(cur.strip()); cur = ""
    return out
def pick(rules):
    keep = []
    for r in rules:
        sel = r[:r.index("{")]
        if sel.strip().startswith("@media"):
            inner = pick(split_rules(r[r.index("{") + 1:r.rindex("}")]))
            if inner: keep.append(sel.strip() + "{\n" + "\n".join(inner) + "\n}")
        elif sel.strip().startswith("@"): continue
        elif any(re.search(r"(?<![\w-])\." + re.escape(w) + r"(?![\w-])", sel) for w in want): keep.append(r)
    return keep
rules = pick(split_rules(css))
text = "\n".join(rules)
text = text.replace("max-width:860px", "max-width:899px").replace("min-width:861px", "min-width:900px")
open(sys.argv[2], "w", encoding="utf8", newline="\n").write("/* Component styles taken from the approved laptop mockup (data/console-mockup-v3-laptop) by tools/extract-css.py. */\n" + text + "\n")
print(len(rules), "rules,", len(text), "chars")
