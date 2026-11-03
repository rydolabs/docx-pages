# GitHub Actions release test gate

## How it works

- `ci.yml`: executes `verify.yml` on push, PR, and manual CI dispatch.
- `verify.yml`: 2 jobs: Node/syntax/unit tests + fixture SHA-256 verification + static build; then Chromium real upload smoke, 51 document browser corpus test, and 37 fixture geometric regression audit. Exports `docx-pages-site` **only after unit/build succeeds** and `docx-pages-test-results` even when the browser stage fails.
- `pages.yml`: manual dispatch only, invokes **the same reusable verification**; the `deploy` job runs **only if** the tests succeed, branch is `main`, and the repository Actions variable `DOCX_PAGES_BETA_APPROVED` equals `true`. This flag is an explicit product owner approval, not automated proof of Word parity. Repository environment `github-pages` should also have a required reviewer.

## Before activating external Pages deployment

1. Resolve the currently open external-beta gates (live official `docx-preview` 0.4.1 comparison; 24 new rights-cleared real-world DOCX; Word PDF baselines; CSP, performance, browsers, telemetry/rollback). Our 45-case public fixture gate is **not a substitute**.
2. Confirm all 45 public DOCX and 87 reference images are allowed for public redistribution; check `tests/README.md` and `docs/LICENSES.md`.
3. Ensure `npm ci` succeeds with network access and the release lockfile contains integrity data. This package was prepared in an offline environment and a hosted-runner installation **has not yet been observed**.
4. Enable GitHub Pages with Actions as its source and apply the required-reviewer environment rule if supported.
5. When external-beta approval is actually granted, set repository variable `DOCX_PAGES_BETA_APPROVED=true`, manually run `Deploy GitHub Pages`, and confirm end-to-end smoke/rollback on the real Pages URL.

Do not mark an Actions workflow green or release-approved based solely on local tests. Chromium and font versions can differ between hosted and local runners; the 0.25pt geometry baseline may need runner calibration **without silently updating the golden baseline**.
