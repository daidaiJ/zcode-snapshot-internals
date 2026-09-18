#!/usr/bin/env python3
"""Rename keepNames idents in src/readable and stamp legal headers.

Readable files are reconstructions. Cite src/01-*.js … src/08-*.js (verbatim
minified excerpts from app.asar), not this directory.

Authored in a Grok Build session.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "readable"
IDENT_TO_NAME: dict[str, str] = {}

HEADER_RE = re.compile(r"^/\*\*.*?\*/\s*", re.S)


def header_for(filename: str) -> str:
    """Per-file legal header: readable copy must cite the verbatim excerpt."""
    if filename.startswith("09"):
        cite = (
            "Cite originals: ../01-sidecar-service.js … ../08-credential-parsing.js\n"
            " * and app.asar → out/host/index.js (no dedicated excerpt for helpers)."
        )
    else:
        cite = f"Cite the original (verbatim minified excerpt): ../{filename}"
    return (
        "/**\n"
        " * STUDY AID — not ZCode source. Do not quote this file as the original.\n"
        " *\n"
        " * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87\n"
        " *   resources/app.asar → out/host/index.js\n"
        f" * {cite}\n"
        " * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.\n"
        " *\n"
        " * keepNames restored; locals e/t/r remain compiler names. Not executable.\n"
        " * Map: ./README.md\n"
        " */\n"
    )

# Short idents collide with catch/locals (`ie`, `me`). Only rewrite
# compiler-style names and the known 2-letter class aliases.
SAFE_SHORT = {
    "Bk",
    "Wk",
    "Hk",
    "dc",
    "su",
    "ict",
    "oct",
    "odt",
    "idt",
    "zk",
    "uo",
    "ac",
    "df",
}


def should_rename(ident: str, name: str) -> bool:
    if ident == name or not name.isidentifier():
        return False
    if ident.startswith("$") or any(c.isdigit() or c == "_" for c in ident):
        return True
    if ident in SAFE_SHORT:
        return True
    if (
        3 <= len(ident) <= 4
        and any(c.isupper() for c in ident)
        and any(c.islower() for c in ident)
    ):
        return True
    return False

KEEP_RELATED = [
    "scanRepoSnapshot",
    "createEncryptedRepoSnapshotArtifact",
    "buildRepoSnapshotGlobalConfigsExtraInputs",
    "collectRepoSnapshotGlobalConfigs",
    "enforceRepoSnapshotDiskQuota",
    "evaluateRepoSnapshotDiskQuota",
    "resolveRepoSnapshotMaxSizeBytes",
    "getRepoSnapshotArtifactPaths",
    "writeGzipTar",
    "writeGzipTarToPath",
    "sha256File",
    "writeNoncePrefix",
    "authHeaders",
    "formatObjectKeys",
    "selectDeltaFiles",
    "canonicalizeRepoSnapshotManifestForHash",
    "computeRepoSnapshotManifestHash",
    "shouldIncludeRepoSnapshotPath",
    "RepoSnapshotStateRepo",
    "cleanupStalePendingFiles",
    "registerPendingUpload",  # method; skip if not a top-level extract
]


def stamp_headers() -> None:
    for path in sorted(OUT.glob("*.js")):
        text = path.read_text(encoding="utf-8")
        body = HEADER_RE.sub("", text, count=1)
        path.write_text(header_for(path.name) + "\n" + body.lstrip("\n"), encoding="utf-8")
        print("header", path.name)


def rename(src: str) -> str:
    items = sorted(
        ((k, v) for k, v in IDENT_TO_NAME.items() if should_rename(k, v)),
        key=lambda kv: len(kv[0]),
        reverse=True,
    )
    for ident, name in items:
        src = re.sub(
            rf"(?<![A-Za-z0-9_]){re.escape(ident)}(?![A-Za-z0-9_])",
            name,
            src,
        )
    src = re.sub(r"a\(this,\"[^\"]+\"\)", "", src)
    src = re.sub(r";?a\([A-Za-z_][\w]*\,\"[^\"]+\"\)", "", src)
    src = re.sub(r"static\{\}", "", src)
    return src


def pull_missing_helpers() -> None:
    from extract_snapshot import (
        BUNDLE,
        extract_balanced,
        find_start,
        slice_window,
        NAME_RE,
    )

    raw = BUNDLE.read_text(encoding="utf-8", errors="replace")
    src = slice_window(raw)
    name_to_ident = {n: i for i, n in NAME_RE.findall(src) if i != "this"}
    blocks = []
    for name in KEEP_RELATED:
        ident = name_to_ident.get(name)
        if not ident:
            continue
        start = find_start(src, ident, name)
        if start is None:
            continue
        marker = f'a({ident},"{name}")'
        mpos = src.find(marker, start)
        try:
            if mpos > start and "class" not in src[start : start + 40]:
                body = src[start : mpos + len(marker)]
            else:
                body = extract_balanced(src, start)
        except ValueError:
            continue
        blocks.append(f"/* keepNames: {ident} -> {name} */\n{body}\n")
    (OUT / "09-related.js").write_text("\n".join(blocks), encoding="utf-8")
    print("09-related helpers", len(blocks))


def main() -> None:
    global IDENT_TO_NAME
    map_path = OUT / "_keepnames.json"
    IDENT_TO_NAME = json.loads(map_path.read_text(encoding="utf-8"))["ident_to_name"]
    pull_missing_helpers()
    related_src = (OUT / "09-related.js").read_text(encoding="utf-8") if (OUT / "09-related.js").exists() else ""
    kept_blocks = []
    for name in KEEP_RELATED:
        m = re.search(
            rf"/\* keepNames: \S+ -> {re.escape(name)} \*/\n.*?(?=\n/\* keepNames:|\Z)",
            related_src,
            re.S,
        )
        if m:
            kept_blocks.append(m.group(0).strip() + "\n")

    if kept_blocks:
        (OUT / "09-related.js").write_text("\n".join(kept_blocks), encoding="utf-8")

    for path in sorted(OUT.glob("*.js")):
        text = path.read_text(encoding="utf-8")
        text = rename(text)
        path.write_text(header_for(path.name) + "\n" + text, encoding="utf-8")
        print(path.name, "bytes", path.stat().st_size)

    (OUT / "_keepnames.json").unlink(missing_ok=True)
    (OUT / "_extracted_names.txt").unlink(missing_ok=True)


if __name__ == "__main__":
    if "--headers-only" in sys.argv:
        stamp_headers()
    else:
        main()
