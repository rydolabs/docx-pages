# DOCX Pages

브라우저에서 DOCX 파일을 미리 보는 정적 웹 앱과 DOCX 렌더링 엔진입니다. **현재 기준은 Phase 48-AY RC**입니다. Microsoft Word와 동일한 편집/인쇄 결과를 보장하지 않으며, **외부 베타 배포 승인 전**입니다.

## 시작하기

Node.js 20 이상이 필요합니다. 저장소 루트에서:

```bash
npm ci
npm run test:ci
python3 -m http.server 8000 --directory dist/site
```

`http://localhost:8000/`에서 로컬 DOCX 파일을 선택합니다. 브라우저 내에서 처리하며 데모 앱 자체는 파일을 서버에 업로드하지 않습니다. `file://`에서 직접 열면 모듈 보안 제약으로 실행되지 않을 수 있습니다.

빌드 결과는 `dist/site/`에 생성됩니다. `dist/`, `node_modules/`는 Git에 올리지 않습니다. **GitHub Pages 배포는 워크플로 수동 실행**이며, CI 통과만으로 외부 베타 승인이 의미하지는 않습니다.

## 라이브러리 사용

```js
import { openDocx } from 'docx-pages';
const result = await openDocx(fileBytes, document.getElementById('viewer'));
// close viewer when replacing a file
result.dispose();
```

브라우저 앱은 JSZip을 UMD 스크립트로 로드하여 `parser.JSZipImpl`로 주입합니다. 따라서 정적 호스팅에서 npm bare module specifier 문제가 없습니다. 다른 빌드 툴(Vite 등)에서는 npm 의존성 `jszip`을 정상 번들링할 수 있습니다. React 어댑터는 `docx-pages/react`, `docx-preview` 호환 API는 `docx-pages/docx-preview`에서 제공됩니다.

## 저장소 구조

- `src/`: 문서 파싱, IR, 스타일, 레이아웃, 렌더링, React/호환 API
- `web/`: 로컬 파일 선택 UI와 기본 페이지 스타일
- `scripts/`: 별도 번들러가 필요 없는 GitHub Pages 정적 빌드/검증
- `tests/`: 45개 자체 제작 DOCX 회귀 코퍼스, 6개 보안·스트레스 문서, 87개 Word 참조 이미지, 단위·브라우저 테스트 (출처 검토 후 공개)
- `tools/`: 공개용 회귀 도구; 추가 Word59 검증은 별도 비공개 QA 코퍼스 사용
- `.github/workflows/`: CI와 수동 Pages 배포
- `docs/`: 출시 기준, 보안, 데이터 공개, 운영 가이드

## 검증 상태

이관 전의 전체 내부 테스트는 JS 409개·Python 44개·브라우저 기하학 37개로 보고됐습니다. 이 공개용 구조에서는 KIMST/Word59/외부 레퍼런스를 제외하므로 **내부 409개 테스트와 동일한 커버리지를 주장하지 않습니다**. `npm test`는 공개 테스트만 실행합니다. 전체 83개 3자 비교 및 실제 배포 보안·운영 검증은 미완료입니다.

## 공개 및 라이선스

이 저장소가 공개되어 있다는 사실만으로 소스 사용권을 허여하지는 않습니다. **프로젝트 자체 라이선스는 소유자가 별도로 결정해야 합니다.** JSZip은 해당 라이선스 고지와 함께 웹 배포 자산에 포함됩니다. 실사용 DOCX, Word PDF/PNG, 원본 벤치마크 결과는 권리와 개인정보 검토 전까지 공개 저장소에 포함하지 않습니다. 세부 사항은 [배포 문서](docs/DEPLOYMENT.md)를 확인하세요.

## GitHub Actions 배포 테스트

`npm run test:release`는 소스/단위 테스트, 픽스처 무결성, 51개 DOCX Chromium 통합 실행, 37개 기하학 회귀를 수행합니다. GitHub Actions에서 `ci.yml`과 `pages.yml`은 동일한 재사용 검증 워크플로(`verify.yml`)를 호출합니다. 배포는 **검증 통과 + main 브랜치 + `DOCX_PAGES_BETA_APPROVED=true`**일 때만 가능합니다. 자세한 지침은 [배포 러너](docs/RELEASE_RUNNER.md), [테스트 자료 목록](tests/README.md)을 참고하세요. 외부 베타 승인 조건(83개 Word PDF/upstream 비교 등)은 아직 충족되지 않았습니다.

## GitHub CI 검증

2026-11-03 첫 GitHub-hosted Actions 실행에서 **401/401 JS 테스트, 45+6 DOCX Chromium 검증, 37/37 기하학 회귀, 정적 사이트 빌드와 실사용 파일 선택 스모크**가 모두 통과했습니다. [실제 실행 로그](https://github.com/rydolabs/docx-pages/actions/runs/41561366696). 외부 베타 승인을 뜻하지는 않습니다.
