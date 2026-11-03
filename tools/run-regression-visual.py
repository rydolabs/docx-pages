"""Render each regression once to collect geometry for all its pages.

Screenshots are intentionally opt-in: rebuilding layout for every page was slow
and unrelated to the frozen numeric geometry gate.
"""
import argparse, json, mimetypes, os, subprocess
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--screenshots',action='store_true',help='Capture the first page of each fixture')
args=parser.parse_args()
subprocess.run(['node',str(root/'tools'/'generate-regression-ir.mjs')],cwd=root,check=True)
html=(root/'tests'/'regression'/'visual'/'viewer.html').read_text(encoding='utf-8')
html=html.replace('<head>','<head><base href="https://docx.local/tests/regression/visual/">',1)
out=root/'tests'/'regression'/'visual'/'output'
if args.screenshots:out.mkdir(parents=True,exist_ok=True)

def local_path_for(url):
    p=urlparse(url)
    if p.scheme!='https' or p.netloc!='docx.local':return None
    candidate=(root/unquote(p.path.lstrip('/'))).resolve()
    try:candidate.relative_to(root.resolve())
    except ValueError:return None
    return candidate

def route_handler(route):
    path=local_path_for(route.request.url)
    if not path or not path.is_file():route.abort();return
    ctype=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    if path.suffix=='.js':ctype='text/javascript'
    elif path.suffix=='.json':ctype='application/json'
    route.fulfill(status=200,body=path.read_bytes(),content_type=ctype)

manifest=json.loads((root/'tests'/'fixtures'/'regression'/'manifest.json').read_text(encoding='utf-8'))
expected={item['id']:item for item in manifest.get('fixtures',[])}
summaries={}
with sync_playwright() as p:
    binary=os.environ.get('CHROMIUM_BIN') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else p.chromium.executable_path)
    browser=p.chromium.launch(headless=True,executable_path=binary,args=['--no-sandbox','--disable-gpu'])
    for ir_path in sorted((root/'tests'/'regression'/'visual'/'ir').glob('*.json')):
        sample=ir_path.stem
        page=browser.new_page(viewport={'width':1414,'height':2000},device_scale_factor=1)
        page.route('https://docx.local/**',route_handler)
        page.set_content(html.replace('__SAMPLE__',sample).replace('__PAGE_INDEX__','0'),wait_until='load')
        page.wait_for_function('window.__VISUAL_READY__ === true',timeout=20000)
        pages=page.evaluate('window.__LAYOUT_SUMMARIES__')
        page_count=len(pages)
        spec=expected.get(sample,{})
        expected_pages=spec.get('expectedBrowserPages')
        if expected_pages is not None and page_count != expected_pages:
            raise RuntimeError(f'{sample}: browser pages {page_count} != manifest {expected_pages}')
        summaries[sample]={'pageCount':page_count,'pages':pages}
        if args.screenshots:
            dest=out/sample;dest.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(dest/'page-1.png'),full_page=False)
        print(f'{sample}: {page_count} pages',flush=True)
        page.close()
    browser.close()
(root/'tests'/'regression'/'visual'/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Geometry summary written: {len(summaries)} fixtures')
