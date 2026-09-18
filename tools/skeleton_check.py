#!/usr/bin/env python3
"""Skeleton equivalence check: readable-1.0 vs readable-2.0.

Tokenize both, drop comments/whitespace, normalize identifiers to <ID>,
pre-apply the same !0/!1/void 0 normalization to 1.0, then compare token
streams. Every difference must be an intentional 2.0 edit (listed in
EXPECTED_TEXT_DIFFS) — anything else means a rename corrupted structure.

Usage: python tools/skeleton_check.py   (exit 1 on unexpected diffs)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC1 = ROOT / "src" / "readable-1.0"
SRC2 = ROOT / "src" / "readable-2.0"

EXPECTED_TEXT_DIFFS = {
    # unicode-escaped log message unescaped for readability (08)
    "upload-credential \\u8FD4\\u56DE\\u4E86\\u975E\\u6CD5 max_size\\uFF0C\\u5DF2\\u5FFD\\u7565\\u8BE5\\u5B57\\u6BB5",
    "upload-credential 返回了非法 max_size，已忽略该字段",
    # beautify corruption fixed against bundle original (09)
    "sessionTargetFrom",
    "_",
    # PEM newline chain rewritten: templates -> plain string literals (08);
    # same runtime values, different literal syntax
    "\\n",
    "\\r\\n",
    "`\\r\n`",
    "`\n`",
    # esbuild __name markers removed by 2.0: a(fn, "name") -> fn (09)
    "abort",
    "evaluate",
    "checkOutputLimit",
}

# Hand-reviewed intentional structural hunks per file (2.0 readability edits:
# destructure shorthand, a()-wrapper removal, loop/promise rewrites). If a
# future regen produces a different count, review the new hunks and update.
EXPECTED_HUNKS = {"02-archive-writer.js": 4, "08-credential-parsing.js": 5, "09-related.js": 13}

TOKEN_RE = re.compile(
    r'"(?:\\.|[^"\\])*"'
    r"|'(?:\\.|[^'\\])*'"
    r"|`(?:\\.|[^`\\])*`"
    r"|[A-Za-z_$][\w$]*"
    r"|\d+(?:\.\d+)?"
    r"|\s+"
    r"|//[^\n]*"
    r"|/\*.*?\*/"
    r"|.",
    re.S,
)


def _norm_template(tok: str) -> str:
    """Skeletonize ${...} code inside a template literal; keep text parts."""
    return "`" + re.sub(
        r"\$\{[^}]*\}",
        lambda m: "${"
        + " ".join(
            "<ID>"
            if re.fullmatch(r"[A-Za-z_$][\w$]*", x) and x not in ("true", "false", "undefined")
            else x
            for x in re.findall(r"[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^A-Za-z_$\w]+", m.group(0)[2:-1])
        )
        + "}",
        tok[1:-1],
    ) + "`"


def skeleton(text: str) -> list[str]:
    text = text.replace("!0", "true").replace("!1", "false")
    text = re.sub(r"\bvoid 0\b", "undefined", text)
    out = []
    for m in TOKEN_RE.finditer(text):
        tok = m.group(0)
        if tok.isspace() or tok.startswith("//") or tok.startswith("/*"):
            continue
        if tok and tok[0] == "`":
            tok = _norm_template(tok)
        if re.fullmatch(r"[A-Za-z_$][\w$]*", tok):
            if tok in ("true", "false", "undefined"):
                out.append(tok)
            else:
                out.append("<ID>")
        else:
            out.append(tok)
    # drop prettier trailing commas before } or )
    cleaned = []
    for i, tok in enumerate(out):
        if tok in (",",) and i + 1 < len(out) and out[i + 1] in ("}", ")"):
            continue
        cleaned.append(tok)
    return cleaned


def strings_of(text: str) -> list[str]:
    out = []
    for m in TOKEN_RE.finditer(text):
        tok = m.group(0)
        if tok and tok[0] in "\"'`":
            body = tok[1:-1] if len(tok) >= 2 else tok
            out.append(_norm_template("`" + body + "`") if tok[0] == "`" else body)
    return out


def main() -> int:
    bad = 0
    for p1 in sorted(SRC1.glob("*.js")):
        p2 = SRC2 / p1.name
        t1, t2 = p1.read_text(encoding="utf-8"), p2.read_text(encoding="utf-8")
        # drop 1.0 file header comment; 2.0 header is new
        t1 = re.sub(r"^/\*\*.*?\*/\s*", "", t1, count=1, flags=re.S)
        t2 = re.sub(r"^/\*\*.*?\*/\s*", "", t2, count=1, flags=re.S)
        s1, s2 = skeleton(t1), skeleton(t2)
        diffs = 0
        if s1 != s2:
            import difflib

            sm = difflib.SequenceMatcher(None, s1, s2, autojunk=False)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    continue
                diffs += 1
                ctx1 = s1[max(0, i1 - 4) : i1 + 6]
                ctx2 = s2[max(0, j1 - 4) : j1 + 6]
                print(f"  {p1.name}: {tag}: …{' '.join(ctx1)}…  ->  …{' '.join(ctx2)}…")
        d1 = {s for s in strings_of(t1) if s not in strings_of(t2)}
        d2 = {s for s in strings_of(t2) if s not in strings_of(t1)}
        unexpected = {
            s for s in (d1 | d2) if s not in EXPECTED_TEXT_DIFFS
        }
        if unexpected:
            print(f"  {p1.name}: UNEXPECTED string diffs: {sorted(unexpected)[:6]}")
            bad += 1
        if diffs:
            expected = EXPECTED_HUNKS.get(p1.name, 0)
            if diffs == expected:
                print(f"  {p1.name}: {diffs} skeleton hunk(s), all hand-reviewed intentional")
            else:
                print(f"  {p1.name}: {diffs} skeleton hunk(s) != expected {expected} — REVIEW")
                bad += 1
        if not diffs and not unexpected:
            print(f"  {p1.name}: skeleton identical, strings OK")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
