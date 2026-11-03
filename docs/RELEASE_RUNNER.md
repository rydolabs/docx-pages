# GitHub Actions release test gate

## How it works

- `ci.yml`: executes `verify.yml` on push, PR, and manual CI dispatch.
- `verify.yml`: 2 jobs: Node/syntax/unit tests + fixture SHA-256 verification + static build; then Chromium real upload smoke, 51 document browser corpus test, and 37 fixture geometric regression audit. Exports `docx-pages-site` **only after unit/build succeeds** and `docx-pages-test-results` even when the browser stage fails.
- `pages.yml`: manual dispatch only, invokes **the same reusable verification**; the `deploy` job runs **only if** the tests succeed, branch is `main`, and the repository Actions variable `DOCX_PAGES_BETA_APPROVED` equals `true`. This flag is an explicit product owner approval, not automated proof of Word parity. Repository environment `github-pages` should also have a required reviewer.

## Before activating external Pages deployment

1. Resolve the currently open external-beta gates (live official `docx-preview` 0.4.1 comparison; 24 new rights-cleared real-world DOCX; Word PDF baselines; CSP, performance, browsers, telemetry/rollback). Our 45-case public fixture gate is **not a substitute**.
2. Confirm all 45 public DOCX and 87 reference images are allowed for public redistribution; check `tests/README.md` and `docs/LICENSES.md`.
3. Hosted `npm ci --ignore-scripts` and all CI tests **passed** on 2026-11-03 ([run 41561366696](https://github.com/rydolabs/docx-pages/actions/runs/41561366696)). The lockfile was originally generated offline without registry integrity/resolved metadata; refresh and review those fields before an external release.
4. Enable GitHub Pages with Actions as its source and apply the required-reviewer environment rule if supported.
5. When external-beta approval is actually granted, set repository variable `DOCX_PAGES_BETA_APPROVED=true`, manually run `Deploy GitHub Pages`, and confirm end-to-end smoke/rollback on the real Pages URL.

Do not mark an Actions workflow green or release-approved based solely on local tests. Chromium and font versions can differ between hosted and local runners; the 0.25pt geometry baseline may need runner calibration **without silently updating the golden baseline**.

## Verified GitHub runner result

- Migration commit: `46125b5a9f5f679c0d2d6bc8cd98e14ff3802cce`
- CI run: [41561366696](https://github.com/rydolabs/docx-pages/actions/runs/41561366696) — **success**
- JS: **401/401**; public DOCX corpus: **45+6 (51/51)**; Word reference images verified: **87**; geometry: **37/37**, 0.25pt tolerance
- Static site build and DOCX upload/close browser smoke: **pass**
- Browser script errors, external requests, failed local resources: **0**
- This validates the GitHub runner path, **not** external beta release readiness or Word 100% parity.
