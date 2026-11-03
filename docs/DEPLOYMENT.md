# Deployment / migration checklist

Target: `https://github.com/rydolabs/docx-pages` (public, initially empty). This deliverable is a **prepared local repository tree**; no GitHub commits, Pages deployments, or npm publications are performed automatically.

## Local validation

```sh
npm ci
npm run test:ci
python3 -m http.server 8000 --directory dist/site
```

Run a browser smoke test with the site's file input and a small synthetic DOCX.

## GitHub import

1. Inspect `docs/DATA_POLICY.md` and audit every fixture/license before pushing to the public repo.
2. Clone `https://github.com/rydolabs/docx-pages.git`, copy contents of the prepared `docx-pages/` directory to its root, check `git status` and `git diff --stat`.
3. Commit the code (`git add -A && git commit -m 'Prepare static DOCX preview deployment'`) and push to `main`. No automatic deployment occurs on push.
4. Wait for the CI workflow to pass (`npm ci`, JS/Python fixture tests, site build, 51-browser-corpus, and 37 geometry fixtures). Confirm site artifact.
5. Only after the separately defined external-beta quality/security/hosting gate is approved, enable Pages (GitHub Actions source), then manually run `Deploy GitHub Pages (manual and gated)` workflow.
6. Verify the published URL including project path (`/docx-pages/`), CSP, DOCX open/reopen/close, Chrome/Firefox/WebKit/mobile, errors, monitoring, and rollback.

## Host and security boundaries

- This static demo is **local-only** and does not add an upload API, storage, authentication or telemetry. If embedded in a backend service, authentication, content limits, headers, upload scanning, storage, privacy and rate limits belong to that service.
- In-browser package limits: 50MiB compressed, 3000 ZIP entries, 25MiB per uncompressed part, 100MiB expanded total by default. These limits do not constitute a complete ZIP-bomb defense.
- Remote third-party requests are not a feature of the demo; validate all DOM/link/image behavior against untrusted DOCX before broad release.
- GitHub Pages is a **public static hosting service**, not a secure document storage product. Do not put user documents in repo/site.

## Release state (not silently promoted)

Internal pilot: conditionally GO. External beta: **NO-GO** until official docx-preview 0.4.1 direct comparison, Word PDF references, 24 additional real-world docs, browser/product QA and rollback/security/monitoring gates pass. Existing Word page count parity 51/59 default, 52/59 Baekmuk. This migration changes file organization, not engine layout code.

## Dependency-lock provenance

The `package-lock.json` was generated **offline** against the frozen Phase48AY dependency directory. Versions are pinned, but registry `integrity` hashes and `resolved` tarball URLs were not available in this environment. GitHub Actions `npm ci` has **not been executed remotely**. Before considering the repository ready for deployment, run `npm install --package-lock-only` in a network-enabled trusted environment, review and commit the refreshed lockfile (including integrity metadata), and verify `npm ci` plus CI.

## Automated hosted runner gate

The `ci.yml` and manual `pages.yml` workflows invoke `.github/workflows/verify.yml`: unit/syntax tests, SHA-256-verified 45+6 DOCX, public static upload smoke, page-count regression in Chromium (51 test files), and 37 frozen geometry fixtures. A failure blocks public deployment. Publishing also requires `main`, an explicit `DOCX_PAGES_BETA_APPROVED=true` repository variable and the `github-pages` environment. Set that variable **only after** the separate 83-document comparison and operations checks are approved. Refer to `docs/RELEASE_RUNNER.md`.
