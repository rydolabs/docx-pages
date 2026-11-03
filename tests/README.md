# Test corpus and GitHub Actions

## Layout

| Location | Count | Origin / function |
|---|---:|---|
| `fixtures/regression/` | 37 | In-house generated regression DOCX; unchanged Phase 48-AY geometry references |
| `fixtures/corpus/diagnostics/` | 8 | In-house diagnostic DOCX used in the actual Phase 49-A 59-document audit |
| `fixtures/corpus/upstream-docx-preview/` | 0 | withheld docxjs sample-derived DOCX from Phase 49-A; see attribution below |
| `fixtures/security/` | 3 | Generated link / escaped markup probes from Phase 49-B |
| `fixtures/stress/` | 3 | Generated 250, 750 and 1,500 paragraph documents from Phase 49-B |
| `fixtures/diagnostics/` | 8 | Earlier specialized unit-test variants (not identical to the 49-A export) |
| `fixtures/track-changes/` | 2 | Existing revision-mode test cases |
| `references/word-png/` | 87 PNG | Word screenshot references for the **45 public** comparison cases |
| `corpus/manifest.json` | 45 records | SHA-256, reference page count, frozen **viewer** RC pages, provenance |
| `corpus/extra-manifest.json` | 6 records | SHA-256 and metadata for safety/stress documents |
| `browser/` | 2 scripts | Real Chromium openDocx and built-site upload/close checks |

Additional 12 generated negative/positive archive safety checks are in `tests/security/release-input-gate.test.js` and run under `npm test`.

The 45-document gate is **37+8**, not 59. The remaining KIMST real-world document is intentionally **not published** because public redistribution rights have not been established. The external-beta target remains 83 documents (59 original + 24 new real-world), not this 45-document public subset.

## Commands

```bash
npm ci
npm run test:ci                # JS tests + integrity manifest + static build
python3 -m pip install playwright==1.57.0
python3 -m playwright install chromium
npm run test:browser:site      # open/close using the built site's UI
npm run test:browser           # openDocx on 45 documents + 6 security/stress
npm run test:geometry          # 37 frozen layout geometry fixtures
npm run test:release            # all test groups
```

On GitHub Actions, `.github/workflows/verify.yml` is invoked by **both PR CI and the manual GitHub Pages deploy workflow**. A failed test blocks site publishing. Test results are stored as Actions artifacts; they are not bundled into the published `dist/site/`.

The `expectedRcPages` field asserts **non-regression against Phase 48-AY**, not Word-perfect pages. For example, eight known Word page-count mismatches remain. Word PNGs are manual/optional analysis references, **not a strict pixel-equivalence assertion on unpinned fonts**. The actual upstream 0.4.1 vs. Word vs. ours full comparison, 24 licensed real-world files, CSP, and multi-browser checks are **still pending external-beta gates**.

## Public test provenance

공개용 45개 비교 문서는 자체 생성 회귀·진단 자료입니다. 공식 `docx-preview` 프로젝트의 파생 문서 13개와 관련 Word 이미지 22장은 재배포 권한 검증 전까지 공개 저장소에서 제외했습니다. 원본 45개 비교 및 51개 통합 검증은 별도 내부 인계본에 보존합니다.
