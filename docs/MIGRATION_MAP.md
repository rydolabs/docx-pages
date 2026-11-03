# Migration map — Phase 48-AY → rydolabs/docx-pages

| Previous Phase48AY path | New public repository path | Decision |
|---|---|---|
| `src/**` | `src/**` | Byte-identical source; no rendering algorithm edits |
| `package.json` | `package.json` | Deployment name/scripts, pinned deps, private npm package |
| `tests/*` (safe unit and synthetic fixtures) | `tests/**` | Retained for CI |
| `tests/fixtures/kimst-template.docx`, 3 dependent test files | **Not public** | Keep in private QA |
| `tests/sweep59/**`, `tests/external/**`, `tests/visual/**` | **Not public** | License/privacy and size review needed |
| `tmpdocs/**`, `artifacts/**`, historical `*.log` | **Not public** | Generated diagnostics, not application runtime |
| `node_modules/**` | **Ignored** | Reinstall with npm ci; only JSZip browser dist is copied at build |
| `tools/run-regression-geometry.py` + dependencies | `tools/**` | Manual browser geometry gate (37 fixtures) |
| New browser demo | `web/**` | Local file selection, no backend upload |
| New static build | `scripts/build-site.mjs` | Output `dist/site/**` (ignored by Git) |
| New CI/manual GitHub Pages | `.github/workflows/**` | No automatic public deployment on push |

The excluded original corpus is still available in the earlier Phase48AY handoff ZIP. Do not copy it back into this public tree without explicit rights/privacy review.
