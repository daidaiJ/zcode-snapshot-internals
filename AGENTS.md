# Agent map — zcode-snapshot-internals

Security-research reconstruction of ZCode Desktop 3.12.2 repo-snapshot upload. Not a product codebase.

## Where to read

1. `README.md` — claims + identifier table + legal disclaimer
2. `src/readable-2.0/` — primary walkthrough copy (semantic renames + narrative comments; entry doc with full minified→name tables). **Do not cite as ZCode source.**
3. `src/readable-1.0/` — archived walkthrough copy (keepNames + prettier); superseded by 2.0, kept for provenance
4. `src/01-*.js` … `src/08-*.js` — **verbatim minified excerpts; cite these**
5. `docs/02-code-flow.md` — six-stage walkthrough (links both)
6. `docs/04-hardening.md` — how to stop the upload
7. `tools/README.md` — asar extract + keepNames (Grok Build) + readable-2.0 pipeline (ZCode+GLM)

## Do not

- Quote `src/readable-1.0/` or `src/readable-2.0/` as the original or as a drop-in ZCode module
- Edit `src/readable-2.0/*.js` by hand — regenerate via `tools/readable2.py`; curated naming/comments live in `tools/readable2_map.py`, verified by `tools/skeleton_check.py`
- Expand scope into exploit / upload-client tooling
- Commit `.extract/` (full host bundle) or `__pycache__/`

## Regen

From a machine with ZCode installed (`D:\Programs\zcode\resources\app.asar` on this host):

```
python tools/extract_snapshot.py
python tools/beautify_snapshot.py
npx prettier --write "src/readable-1.0/*.js"
python tools/readable2.py
npx prettier --write "src/readable-2.0/*.js"
node --check src/readable-2.0/*.js && python tools/skeleton_check.py
```
