# Public repository test data policy (Phase 49-D)

The planned GitHub repository `rydolabs/docx-pages` is **public**. Content rights and privacy review are required before publishing test assets.

## Prepared public candidates

- 37 in-house synthetic regression DOCX (already in the Phase 49-C repository tree).
- 8 in-house diagnostic DOCX as used in the Phase 49-A actual browser comparison, stored separately from older diagnostic variants.
- 13 `docxjs` / `docx-preview` example-derived DOCX: **withheld from public repository** until rights and embedded-asset review.
- 3 synthetic security input DOCX; 3 synthetic long-document stress DOCX.
- 87 Word page screenshots generated from 45 in-house regression and diagnostic cases; no upstream-derived PNGs are publicly committed.
- Existing 8 specialized diagnostic fixtures and 2 revision fixtures, plus test source and geometry snapshots.

## Excluded / withheld

- Real-world KIMST DOCX and its Word images, extracted XML, metadata or screenshots: **do not commit until redistribution rights and sensitive-content review are complete**.
- Any user-uploaded document, original private PDF, private QA log, prior handoff archive, or private Word59 comparison environment.
- The extra 24 real-world documents required for the final 83-case gate are not yet acquired; do not fabricate them.

## Public-site distribution boundary

Only `dist/site/` is deployed by GitHub Pages, and its build does **not** copy test DOCX, test Word images, HTML diagnostics, or results. Files in `tests/` would nevertheless be publicly downloadable from GitHub source history if committed. Treat the ZIP as a **ready-for-review source package** rather than evidence of public redistribution authorization.

`tests/corpus/manifest.json` checks SHA-256, size, Word reference image counts and expected **viewer** pagination. The frozen RC page counts are not Word page parity and do not certify docx-preview 0.4.1 non-inferiority.
