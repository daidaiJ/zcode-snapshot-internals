#!/usr/bin/env python3
"""Build src/readable-2.0 from src/readable-1.0.

2.0 = 1.0 (keepNames restore) + curated renames + narrative comments:
  - per-method local variable names (scoped to the method, not the file)
  - Node builtin import aliases restored to real names (mkdir, join, ...)
  - internal helpers keep their bundle keepNames; undocumented ones get
    purpose-built names in the same style (flagged in the map)
  - UPPER_SNAKE constants; !0/!1/void 0 normalized
  - JSDoc on every symbol and plain-Chinese narration at key call sites

Curated knowledge lives in readable2_map.py. Every rule is verified against
the input; unmatched rules and minified residue in the output are reported
loudly and fail the run (exit 1).

Usage:  python tools/readable2.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from readable2_map import (
    ALLOWED_RESIDUE,
    BLOCKS,
    FILE_HEADERS,
    GLOBAL_SCHEMA_VALUE_COMMENTS,
    GLOBAL_WORD_RULES,
    KEYWORDS,
    TAIL_RULES,
)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "readable-1.0"
OUT = ROOT / "src" / "readable-2.0"

MARKER_RE = re.compile(r"/\* keepNames: (\S+) -> (\w+) \*/")
HEADER_RE = re.compile(r"^/\*\*.*?\*/\s*", re.S)
METHOD_RE = re.compile(r"(?m)^  (?:async )?(\w+)\(")


def word_rx(old: str) -> str:
    return r"(?<![A-Za-z0-9_$])" + re.escape(old) + r"(?![A-Za-z0-9_$])"


def literal_spans(text: str) -> list[tuple[int, int]]:
    """Spans of string literals and template texts (template ${...} code stays
    outside the spans, so renames inside interpolations keep working)."""
    spans: list[tuple[int, int]] = []
    i, n = 0, len(text)
    ctx = ["code"]
    tpl_depths: list[int] = []
    depth = 0
    seg_start: int | None = None
    while i < n:
        ch = text[i]
        state = ctx[-1]
        if state == "code":
            if ch == '"':
                ctx.append("dq")
                seg_start = i
            elif ch == "'":
                ctx.append("sq")
                seg_start = i
            elif ch == "`":
                ctx.append("tpl")
                seg_start = i
            elif ch == "{":
                depth += 1
            elif ch == "}":
                if depth:
                    depth -= 1
                if tpl_depths and depth == tpl_depths[-1]:
                    tpl_depths.pop()
                    if len(ctx) > 1 and ctx[-1] == "code":
                        ctx.pop()  # leave ${...}, resume template text
                        seg_start = i + 1
            i += 1
            continue
        if ch == "\\":
            i += 2
            continue
        if (state == "dq" and ch == '"') or (state == "sq" and ch == "'") or (
            state == "tpl" and ch == "`"
        ):
            spans.append((seg_start, i + 1))
            ctx.pop()
            seg_start = None
            i += 1
            continue
        if state == "tpl" and ch == "$" and i + 1 < n and text[i + 1] == "{":
            spans.append((seg_start, i))
            ctx.append("code")
            tpl_depths.append(depth)
            depth += 1
            seg_start = None
            i += 2
            continue
        i += 1
    return spans


def apply_word_renames(text: str, rules: list, label: str, problems: list[str]) -> str:
    for old, new in rules:
        spans = literal_spans(text)
        pattern = re.compile(word_rx(old))

        def repl(m: re.Match, _new: str = new, _spans: list = spans) -> str:
            if any(s <= m.start() < e for s, e in _spans):
                return m.group(0)
            return _new

        text, n = pattern.subn(repl, text)
        if n == 0:
            problems.append(f"{label}: word '{old}' matched nothing")
    return text


def apply_rules(text: str, spec: dict, label: str, problems: list[str]) -> str:
    for old, new, *rest in spec.get("literals", []):
        expect = rest[0] if rest else 1
        found = text.count(old)
        if found != expect:
            problems.append(f"{label}: literal found x{found}, expected x{expect}: {old[:64]!r}")
        text = text.replace(old, new)
    for pat, repl in spec.get("regex", []):
        # lambda replacement: take repl verbatim, no backref/template processing
        text, n = re.subn(pat, lambda _m, _r=repl: _r, text)
        if n == 0:
            problems.append(f"{label}: regex {pat[:48]!r} matched nothing")
    text = apply_word_renames(text, spec.get("words", []), label, problems)
    return text


def apply_notes(text: str, spec: dict, label: str, problems: list[str]) -> str:
    for anchor, note in spec.get("notes", []):
        lines = text.split("\n")
        placed = False
        for i, line in enumerate(lines):
            if re.search(anchor, line):
                indent = re.match(r"[ \t]*", line).group(0)
                block = [f"{indent}{ln}" for ln in note.split("\n")]
                lines[i:i] = block
                placed = True
                break
        if not placed:
            problems.append(f"{label}: note anchor {anchor[:48]!r} matched nothing")
        else:
            text = "\n".join(lines)
    return text


def split_class_scopes(body: str) -> list[tuple[str, str, int, int]]:
    """Return (key, text, start, end) spans for each method of a class body.

    Non-method prefix (class fields) comes back under key "".
    """
    methods = list(METHOD_RE.finditer(body))
    if not methods:
        return []
    spans = []
    head_end = methods[0].start()
    if body[:head_end].strip(" {\n"):
        spans.append(("", body[:head_end], 0, head_end))
    for i, m in enumerate(methods):
        end = methods[i + 1].start() if i + 1 < len(methods) else len(body)
        spans.append((m.group(1), body[m.start() : end], m.start(), end))
    return spans


def transform_block(ident: str, name: str, block: str, problems: list[str]) -> str:
    marker = f"/* keepNames: {ident} -> {name} */"
    body = block[len(marker) :].lstrip("\n").rstrip() + "\n"
    header = f"{marker}\n"

    class_spec = BLOCKS.get(name, {})
    note_specs: list[tuple[str, dict]] = []
    scopes = split_class_scopes(body) if re.search(r"\bclass\b", body[:120]) else []
    if scopes:
        parts, cursor = [], 0
        for key, text, start, end in scopes:
            parts.append(body[cursor:start])
            label = f"{name}.{key}" if key else name
            if key:
                spec = BLOCKS.get(f"{name}.{key}")
                if spec is None:
                    problems.append(f"{label}: no spec for method scope")
                else:
                    text = apply_rules(text, spec, label, problems)
                    note_specs.append((label, spec))
            parts.append(text)
            cursor = end
        parts.append(body[cursor:])
        body = "".join(parts)
        body = apply_rules(body, class_spec, name, problems)
    else:
        if not class_spec:
            problems.append(f"{name}: no spec for block")
        body = apply_rules(body, class_spec, name, problems)
    note_specs.append((name, class_spec))

    body = apply_rules(body, {"words": GLOBAL_WORD_RULES}, f"{name}<global>", [])
    for label, spec in note_specs:
        body = apply_notes(body, spec, label, problems)
    for old, new in GLOBAL_SCHEMA_VALUE_COMMENTS:
        if old in body and new not in body:
            body = body.replace(old, new)

    doc = class_spec.get("doc")
    if doc:
        header += f"{doc}\n"
    return header + body + "\n"


def strip_strings(text: str) -> str:
    code = re.sub(r"`(?:\\.|[^`\\])*`", "``", text, flags=re.S)
    code = re.sub(r'"(?:\\.|[^"\\])*"', '""', code)
    code = re.sub(r"'(?:\\.|[^'\\])*'", "''", code)
    code = re.sub(r"//[^\n]*", "", code)
    return re.sub(r"/\*.*?\*/", "", code, flags=re.S)


BUILTIN_IDENTS = {
    "Date", "JSON", "Map", "Math", "URL", "Set", "Buffer", "Promise",
    "Headers", "FormData", "AbortSignal", "DOMException", "Object", "Error",
    "Number", "Boolean", "process", "g", "$",
}


def minified_idents(text: str, targets: set[str]) -> set[str]:
    """Candidate minified idents (<=4 chars, not a keyword/target/property key)."""
    code = strip_strings(text)
    found = set()
    for m in re.finditer(r"(?<![.\w$])([A-Za-z_$][\w$]*)", code):
        name = m.group(1)
        if (
            name in KEYWORDS
            or name in targets
            or name in BUILTIN_IDENTS
            or name in ALLOWED_RESIDUE
            or name.startswith("__")
        ):
            continue
        if len(name) > 4:
            continue
        after = code[m.end() :].lstrip()
        if after.startswith(":"):
            continue  # object key
        found.add(name)
    return found


def residue_scan(text: str, candidates: set[str], filename: str) -> list[str]:
    code = strip_strings(text)
    present = {
        m.group(1)
        for m in re.finditer(r"(?<![.\w$])([A-Za-z_$][\w$]*)", code)
    }
    return [
        f"{filename}: residue ident {c!r} survived the rename"
        for c in sorted(candidates & present)
    ]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    problems: list[str] = []
    for path in sorted(SRC.glob("*.js")):
        text = path.read_text(encoding="utf-8")
        text = HEADER_RE.sub("", text, count=1)
        targets = {m.group(2) for m in MARKER_RE.finditer(text)}
        candidates = minified_idents(text, targets)
        pieces = [FILE_HEADERS[path.name]]
        last = 0
        for m in MARKER_RE.finditer(text):
            if m.start() > last and text[last : m.start()].strip():
                problems.append(f"{path.name}: unmarked code before {m.group(2)}")
            nxt = MARKER_RE.search(text, m.end())
            end = nxt.start() if nxt else len(text)
            pieces.append(transform_block(m.group(1), m.group(2), text[m.start() : end], problems))
            last = end
        out = "\n".join(pieces)
        for old, new in TAIL_RULES:
            out = out.replace(old, new)
        problems.extend(residue_scan(out, candidates, path.name))
        (OUT / path.name).write_text(out, encoding="utf-8")
        print(f"{path.name}: {len(out)} bytes")

    if problems:
        print("\n== PROBLEMS ==")
        for p in problems:
            print(" !!", p)
        return 1
    print("\nall rules matched, no residue")
    return 0


if __name__ == "__main__":
    sys.exit(main())
