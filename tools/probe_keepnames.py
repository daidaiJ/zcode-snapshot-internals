#!/usr/bin/env python3
"""Probe .extract/*.js for the original names of minified idents.

Maintenance aid for tools/readable2_map.py. Resolution order, following how
esbuild actually emits names:

  1. keepNames markers in host-index.js: `a(IDENT,"Name")` and
     `var IDENT=class…{static{a(this,"Name")}}`;
  2. import aliases: host does `import{Hf as uo} from "./chunk-X.js"`;
     chunks re-export under yet other names (`export{_2 as yf} from …`),
     so chase  host local -> chunk export -> chunk local binding -> s(...) keepName;
  3. literal const assignments (schema ids, numbers like `mlt=2*1024*…`).

Everything the bundle never names gets a purpose-built name in
readable2_map.py and is flagged ※按用途 in src/readable-2.0/README.md.

Usage: python tools/probe_keepnames.py [IDENT ...]   (default: known backlog)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACT = ROOT / ".extract"

DEFAULT_TARGETS = [
    # backlog: currently everything module-level is resolved; extend as needed
    "uo", "Qn", "eee", "GS", "Q7", "tee", "aee", "see", "ree", "oee", "iee",
]


def load_texts() -> dict[str, str]:
    return {
        f.name: f.read_text(encoding="utf-8", errors="replace")
        for f in sorted(EXTRACT.glob("*.js"))
    }


def find_keepname(src: str, ident: str) -> list[str]:
    # host annotates with a(...), chunks with s(...) — try both
    names = set()
    for marker in ("a", "s"):
        names |= set(re.findall(rf'{marker}\({re.escape(ident)},"([^"]+)"\)', src))
    for m in re.finditer(
        rf"[,;(]\s*{re.escape(ident)}\s*=\s*class[^{{]{{0,60}}\{{static\{{[as]\(this,\"([^\"]+)\"\)",
        src,
    ):
        names.add(m.group(1))
    for m in re.finditer(
        rf"\bvar\s+{re.escape(ident)}\s*=\s*class[^{{]{{0,60}}\{{static\{{[as]\(this,\"([^\"]+)\"\)",
        src,
    ):
        names.add(m.group(1))
    return sorted(names)


def find_def(src: str, ident: str, limit: int = 120) -> list[str]:
    pat = re.compile(
        r"[,;\n](" + re.escape(ident) + r")\s*=\s*"
        r"(\"(?:[^\"\\]|\\.)*\"|function\s*\([^)]*\)\{.{0,"
        + str(limit)
        + r"}|[^;\n]{1,100})"
    )
    hits = []
    for m in pat.finditer(src):
        d = m.group(0)[len(ident) + 3 :][:limit]
        if d not in hits:
            hits.append(d)
        if len(hits) >= 2:
            break
    return hits


def import_alias_map(host_src: str) -> dict[str, tuple[str, str]]:
    alias: dict[str, tuple[str, str]] = {}
    for m in re.finditer(r'import\{([^}]*)\}from"\./(chunk-[\w]+\.js)"', host_src):
        for pair in m.group(1).split(","):
            if " as " not in pair:
                continue
            exp, local = [p.strip() for p in pair.split(" as ", 1)]
            alias.setdefault(local, (chunk_of(m), exp))
    return alias


def chunk_of(m: re.Match) -> str:
    return m.group(2)


def chase_export_local(chunk_src: str, export_name: str) -> str | None:
    """chunk re-export lists rename locals: `export{_2 as yf} …`."""
    for m in re.finditer(r"export\{([^}]*)\}", chunk_src):
        for pair in m.group(1).split(","):
            parts = [p.strip() for p in pair.split(" as ")]
            if len(parts) == 2 and parts[1] == export_name:
                return parts[0]
    return None


def resolve(ident: str, texts: dict[str, str]) -> str:
    host = texts.get("host-index.js", "")
    names = find_keepname(host, ident)
    if names:
        return f"{' | '.join(names)}"
    lits = find_def(host, ident)
    if lits and lits[0].startswith('"'):
        return f"literal {lits[0]}"
    # import alias -> chunk export name -> chunk local binding
    alias = import_alias_map(host)
    if ident in alias:
        chunk, exp = alias[ident]
        csrc = texts.get(chunk, "")
        local = chase_export_local(csrc, exp)
        candidates = [local] if local else [exp]
        for cand in candidates:
            kn = find_keepname(csrc, cand)
            if kn:
                return f"{' | '.join(kn)}  (via {chunk}: export {exp} <- local {cand})"
            defs = find_def(csrc, cand)
            if defs:
                return f"{defs[0]}  (via {chunk}: export {exp} <- local {cand})"
        return f"(via {chunk}: export {exp} <- local {candidates[0]}: no keepName/def)"
    return "(no bundle name — name by purpose in readable2_map.py)"


def main() -> int:
    targets = sys.argv[1:] or DEFAULT_TARGETS
    texts = load_texts()
    for ident in targets:
        print(f"{ident:<6} -> {resolve(ident, texts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
