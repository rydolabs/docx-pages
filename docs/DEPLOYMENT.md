# Deployment / migration checklist

Target: `https://github.com/rydolabs/docx-pages` (public). The initial migration was committed to `main` on 2026-11-03. Hosted CI passed; GitHub Pages deployment and npm publication have **not** been performed.

## Local validation

```sh
npm ci
npm run test:ci
python3 -m http.server 8000 --directory dist/site
```

Run a browser smoke test with the site's file input and a small synthetic DOCX.

## GitHub CI and release process

1. A push or PR triggers `CI`, which installs locked dependencies, checks the source and the fixture manifest, builds the demo, and runs Chromium DOCX and geometry regression suites.
2. [First hosted verification passed](https://github.com/rydolabs/docx-pages/actions/runs/41561366696) on commit `46125b5` (401 JavaScript tests, 51/51 document cases, 37 geometry fixtures, static website smoke).
3. Keep real-world, private, and rights-unverified documents outside this public repository. Changes to public fixtures require explicit source and licensing review.
4. Public Pages deployment is separate and manual: `main`, passing release tests, and `DOCX_PAGES_BETA_APPROVED=true` are all required.
5. Do not set the beta approval variable until independent Word PDF / upstream `docx-preview` / operations gates are cleared. Validate the public Pages URL and rollback afterward.

## Host and security boundaries

- This static demo is **local-only** and does not add an upload API, storage, authentication or telemetry. If embedded in a backend service, authentication, content limits, headers, upload scanning, storage, privacy and rate limits belong to that service.
- In-browser package limits: 50MiB compressed, 3000 ZIP entries, 25MiB per uncompressed part, 100MiB expanded total by default. These limits do not constitute a complete ZIP-bomb defense.
- Remote third-party requests are not a feature of the demo; validate all DOM/link/image behavior against untrusted DOCX before broad release.
- GitHub Pages is a **public static hosting service**, not a secure document storage product. Do not put user documents in repo/site.

## Release state (not silently promoted)

Internal pilot: conditionally GO. External beta: **NO-GO** until official docx-preview 0.4.1 direct comparison, Word PDF references, 24 additional real-world docs, browser/product QA and rollback/security/monitoring gates pass. Existing Word page count parity 51/59 default, 52/59 Baekmuk. This migration changes file organization, not engine layout code.

## Dependency-lock provenance

The `package-lock.json` was generated **offline** against the frozen Phase48AY dependency directory. Versions are pinned, but registry `integrity` hashes and `resolved` tarball URLs were not available in this environment. GitHub-hosted Actions `npm ci --ignore-scripts` **succeeded** on 2026-11-03 (run 41561366696). For supply-chain reproducibility before external beta, run `npm install --package-lock-only` in a network-enabled trusted environment, review and commit the refreshed lockfile (including integrity metadata), and verify `npm ci` plus CI.

## Automated hosted runner gate

The `ci.yml` and manual `pages.yml` workflows invoke `.github/workflows/verify.yml`: unit/syntax tests, SHA-256-verified 45+6 DOCX, public static upload smoke, page-count regression in Chromium (51 test files), and 37 frozen geometry fixtures. A failure blocks public deployment. Publishing also requires `main`, an explicit `DOCX_PAGES_BETA_APPROVED=true` repository variable and the `github-pages` environment. Set that variable **only after** the separate 83-document comparison and operations checks are approved. Refer to `docs/RELEASE_RUNNER.md`.
