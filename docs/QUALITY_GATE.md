# External beta quality gate

**Public app structure is not external beta approval.** Prior commitment:

1. Same environment (OS, fonts, viewport, Chromium) for Word-exported PDF baseline, official pinned docx-preview and our viewer.
2. Direct comparisons on existing 59 documents plus 24 separately licensed real-world documents (83 total); zero P0 content clipping/omission/unintended overlap; per-document non-inferiority, aggregate improvements as specified in Phase49 plan.
3. Corrupt/oversized/hostile DOCX security tests; full integration and performance on large image/table documents.
4. Chrome, Firefox, WebKit, mobile, app lifecycle and cleanup, memory, CSP, upload/privacy, monitoring, feature flag and rollback checks.
5. Full private Word59 and original 409 JS + 44 Python + 37 geometry checks against the frozen baseline, with honest results.

Phase49-B found 59/59 browser API render successes and synthetic stress cases, but the formal official docx-preview direct comparison and 24 real-world samples are still unverified. Do not mark these as passed based on screenshots or internal page count alone.
