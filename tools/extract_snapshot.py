#!/usr/bin/env python3
"""Slice repo-snapshot functions from a minified ZCode host bundle.

Output under src/readable-1.0/ is a STUDY AID. The citable originals are the
verbatim minified excerpts in src/01-*.js … src/08-*.js (and app.asar itself).
Do not present the readable copy as ZCode source.

Authored in a Grok Build session; see also readable2.py (1.0 -> 2.0 upgrade).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / ".extract" / "host-index.js"
OUT_DIR = ROOT / "src" / "readable-1.0"
VERBATIM_DIR = ROOT / "src" / "verbatim"
NAME_RE = re.compile(r'a\(([^,()]+),"([^"]+)"\)')
INTEREST = re.compile(
    r"(?i)snapshot|upload|encrypt|archive|manifest|credential|pending|"
    r"checkpoint|envelope|sidecar|tar|oss|delta|plaintext|artifact"
)

# Pipeline files: keepNames target -> output stem
MODULES = [
    ("01-sidecar-service.js", ["RepoSnapshotSidecarService", "removeGeneratedArtifactFiles"]),
    ("02-archive-writer.js", ["buildRepoSnapshotDelta", "fileMap", "createBufferTarEntry", "writeRepoSnapshotPlainArchive", "normalizeTarPath"]),
    ("03-encrypt-archive.js", ["encryptArchive", "sha256File", "writeNoncePrefix", "normalizeTarPath"]),
    ("04-upload-client.js", ["RepoSnapshotUploadClient", "buildUploadCredentialUrl", "authHeaders", "uploadCredentialTokenHash"]),
    ("05-oss-post-object.js", ["uploadPutObject", "uploadPostObject", "buildObjectUploadTarget", "encodeOssCallback", "replaceOssCallbackPlaceholders"]),
    ("06-upload-worker.js", ["RepoSnapshotUploadWorker", "readWorkspaceSizeBytes", "readEnvelope", "readManifest"]),
    ("07-pending-manager.js", ["RepoSnapshotPendingManager"]),
    ("08-credential-parsing.js", ["describeUploadCredentialShape", "resolveUploadCredentialData", "formatObjectKeys", "normalizeUploadCredentialMaxSize", "normalizePublicKeySpkiPem"]),
]


def find_start(src: str, ident: str, kind_hint: str) -> int | None:
    needles = [
        f"async function {ident}(",
        f"function {ident}(",
        f"var {ident}=class",
        f"let {ident}=class",
        f"const {ident}=class",
        f",{ident}=class",
        f";{ident}=class",
    ]
    hits = [src.find(n) for n in needles]
    hits = [h for h in hits if h >= 0]
    return min(hits) if hits else None


_REGEX_PREFIX = set("=,([:!&|?;{")


def extract_balanced(src: str, start: int) -> str:
    """Brace-match a function/class, skipping strings, templates, comments, regex."""
    brace = src.find("{", start)
    if brace < 0:
        raise ValueError("no opening brace")
    depth = 0
    i = brace
    # stack: "code" | "dquote" | "squote" | "tpl"
    ctx = ["code"]
    tpl_depths: list[int] = []
    esc = False
    last_code = " "
    n = len(src)
    while i < n:
        ch = src[i]
        state = ctx[-1]
        if state != "code":
            if esc:
                esc = False
                i += 1
                continue
            if ch == "\\":
                esc = True
                i += 1
                continue
            if state == "tpl" and ch == "$" and i + 1 < n and src[i + 1] == "{":
                ctx.append("code")
                tpl_depths.append(depth)
                depth += 1
                last_code = "{"
                i += 2
                continue
            if (state == "dquote" and ch == '"') or (state == "squote" and ch == "'") or (state == "tpl" and ch == "`"):
                ctx.pop()
            i += 1
            continue
        if ch in " \t\n\r":
            i += 1
            continue
        if ch == '"':
            ctx.append("dquote")
            last_code = ch
            i += 1
            continue
        if ch == "'":
            ctx.append("squote")
            last_code = ch
            i += 1
            continue
        if ch == "`":
            ctx.append("tpl")
            last_code = ch
            i += 1
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "/":
            nl = src.find("\n", i)
            i = n if nl < 0 else nl + 1
            continue
        if ch == "/" and i + 1 < n and src[i + 1] == "*":
            endc = src.find("*/", i + 2)
            i = n if endc < 0 else endc + 2
            continue
        if ch == "/" and last_code in _REGEX_PREFIX:
            i += 1
            esc = False
            while i < n:
                c2 = src[i]
                if esc:
                    esc = False
                elif c2 == "\\":
                    esc = True
                elif c2 == "[":
                    # character class
                    i += 1
                    while i < n:
                        if src[i] == "\\" and i + 1 < n:
                            i += 2
                            continue
                        if src[i] == "]":
                            break
                        i += 1
                elif c2 == "/":
                    i += 1
                    while i < n and src[i].isalpha():
                        i += 1
                    break
                i += 1
            last_code = "/"
            continue
        if ch == "{":
            depth += 1
            last_code = ch
            i += 1
            continue
        if ch == "}":
            depth -= 1
            last_code = ch
            if tpl_depths and depth == tpl_depths[-1]:
                tpl_depths.pop()
                if len(ctx) > 1 and ctx[-1] == "code":
                    ctx.pop()
            if depth == 0:
                end = i + 1
                if end < n and src[end] == ";":
                    end += 1
                return src[start:end]
            i += 1
            continue
        last_code = ch
        i += 1
    raise ValueError("unbalanced")


def class_methods(src: str) -> list[str]:
    return re.findall(r"\b(?:async\s+)?([A-Za-z_][\w]*)\(", src)


def slice_window(src: str) -> str:
    """Most snapshot symbols sit in one cluster; avoid scanning the whole 2.5MB repeatedly."""
    anchors = [
        'a(this,"RepoSnapshotSidecarService")',
        'a(ict,"writeRepoSnapshotPlainArchive")',
        'a(oct,"encryptArchive")',
        'a(this,"RepoSnapshotUploadClient")',
        'a(this,"RepoSnapshotUploadWorker")',
        'a(hIe,"describeUploadCredentialShape")',
        "/api/v1/snapshot/upload-credential",
    ]
    hits = [src.find(a) for a in anchors]
    hits = [h for h in hits if h >= 0]
    if not hits:
        raise SystemExit("snapshot cluster not found in host-index.js")
    lo, hi = min(hits), max(hits)
    # generous padding so class/function heads and tails are included
    lo = max(0, lo - 80_000)
    hi = min(len(src), hi + 120_000)
    print(f"window bytes {lo}:{hi} ({hi-lo})")
    return src[lo:hi]


def main() -> None:
    raw = BUNDLE.read_text(encoding="utf-8", errors="replace")
    src = slice_window(raw)
    keep = NAME_RE.findall(src)
    snap = [(a, b) for a, b in keep if INTEREST.search(b)]
    ident_to_name: dict[str, str] = {}
    name_to_ident: dict[str, str] = {}
    for ident, name in keep:
        ident = ident.strip()
        if ident in {"this"}:
            continue
        ident_to_name[ident] = name
        name_to_ident[name] = ident

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"keepNames snapshot-ish: {len(snap)}  unique idents: {len(ident_to_name)}")

    extracted: dict[str, str] = {}
    missing: list[str] = []
    for m in re.finditer(r'var (\w+)=class\{static\{a\(this,"([^"]+)"\)\}', src):
        ident, name = m.group(1), m.group(2)
        ident_to_name[ident] = name
        name_to_ident[name] = ident
        try:
            extracted[name] = extract_balanced(src, m.start())
        except ValueError as e:
            missing.append(f"{name} ({e})")

    for name, ident in name_to_ident.items():
        if name in extracted:
            continue
        start = find_start(src, ident, name)
        if start is None:
            missing.append(name)
            continue
        marker = f'a({ident},"{name}")'
        mpos = src.find(marker, start)
        try:
            if mpos > start and "class" not in src[start : start + 40]:
                extracted[name] = src[start : mpos + len(marker)]
            else:
                extracted[name] = extract_balanced(src, start)
        except ValueError as e:
            missing.append(f"{name} ({e})")

    map_path = OUT_DIR / "_keepnames.json"
    map_path.write_text(
        json.dumps({"ident_to_name": ident_to_name, "name_to_ident": name_to_ident}, indent=2),
        encoding="utf-8",
    )
    print(f"extracted bodies: {len(extracted)}  missing starts: {len(missing)}")
    if missing:
        print("missing:", ", ".join(missing[:40]))

    # Write per-module files (raw, prettier later)
    used = set()
    for filename, names in MODULES:
        parts = []
        for name in names:
            body = extracted.get(name)
            if not body:
                continue
            used.add(name)
            ident = name_to_ident.get(name, "?")
            parts.append(f"/* keepNames: {ident} -> {name} */\n{body}\n")
        (OUT_DIR / filename).write_text("\n".join(parts), encoding="utf-8")
        print(f"  {filename}: {len(parts)} symbols, {sum(len(p) for p in parts)} bytes")

    leftover = sorted(set(extracted) - used)
    if leftover:
        extra = []
        for name in leftover:
            ident = name_to_ident.get(name, "?")
            extra.append(f"/* keepNames: {ident} -> {name} */\n{extracted[name]}\n")
        (OUT_DIR / "09-related.js").write_text("\n".join(extra), encoding="utf-8")
        print(f"  09-related.js: {len(leftover)} leftover symbols")

    (OUT_DIR / "_extracted_names.txt").write_text("\n".join(sorted(extracted)), encoding="utf-8")


if __name__ == "__main__":
    main()
