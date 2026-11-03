import { openDocx } from './src/index.js';

const input = document.getElementById('docx-file');
const viewer = document.getElementById('viewer');
const clearButton = document.getElementById('clear-button');
const status = document.getElementById('status');
let currentResult = null;
let opening = false;
let generation = 0;

function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function clearViewer() {
  generation++;
  currentResult?.dispose?.();
  currentResult = null;
  viewer.replaceChildren();
  input.value = '';
  clearButton.disabled = true;
  show('파일은 서버로 업로드하지 않습니다. 기기에서 DOCX 파일을 선택하세요.');
}

async function load(file) {
  const request = ++generation;
  currentResult?.dispose?.();
  currentResult = null;
  viewer.replaceChildren();
  if (!file) return;
  const maxBytes = 50 * 1024 * 1024;
  if (!/\.docx$/i.test(file.name) || file.size > maxBytes) {
    show('50MiB 이하의 .docx 파일만 지원합니다.', true);
    return;
  }
  if (opening) {
    show('이전 파일을 처리 중입니다. 완료한 다음 다시 선택하세요.', true);
    return;
  }
  if (!window.JSZip) {
    show('DOCX 압축 해제 라이브러리를 불러오지 못했습니다.', true);
    return;
  }
  opening = true;
  input.disabled = true;
  show(`${file.name} 파일을 분석하고 있습니다…`);
  let result;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    result = await openDocx(bytes, viewer, {
      parser: { JSZipImpl: window.JSZip },
      waitForFonts: true
    });
    if (request !== generation) { result.dispose?.(); return; }
    currentResult = result;
    clearButton.disabled = false;
    const pages = result.layout?.pages?.length ?? viewer.querySelectorAll('.docx-page').length;
    show(`${file.name} · ${pages}페이지 · 미리보기 완료 (Word 원본과 일부 배치가 다를 수 있습니다)`);
  } catch (error) {
    result?.dispose?.();
    viewer.replaceChildren();
    if (request === generation) show(`미리보기를 열 수 없습니다: ${error?.message || '알 수 없는 오류'}`, true);
  } finally {
    opening = false;
    input.disabled = false;
  }
}

input.addEventListener('change', () => { void load(input.files?.[0]); });
clearButton.addEventListener('click', clearViewer);
window.addEventListener('pagehide', () => currentResult?.dispose?.());
