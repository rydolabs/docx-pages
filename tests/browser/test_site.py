"""Test generated GitHub Pages app with a real file upload in Chromium."""
from pathlib import Path
from urllib.parse import urlparse,unquote
import json,mimetypes,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
SITE=ROOT/'dist/site'
SAMPLE=ROOT/'tests/fixtures/regression/common-formatting.docx'
BASE='https://docx.local/'

def main():
    assert (SITE/'index.html').is_file(),'run npm run build:site first'
    errors=[];external=[]
    def handle(route):
        url=urlparse(route.request.url)
        if url.netloc!='docx.local':route.abort();return
        local=(SITE/unquote(url.path.lstrip('/'))).resolve()
        try:local.relative_to(SITE.resolve())
        except ValueError:route.abort();return
        if local.is_dir():local=local/'index.html'
        if not local.is_file():route.fulfill(status=404,body='not found');return
        mime=mimetypes.guess_type(local.name)[0] or 'application/octet-stream'
        if local.suffix in ('.js','.mjs'):mime='application/javascript'
        route.fulfill(status=200,body=local.read_bytes(),content_type=mime)
    with sync_playwright() as p:
        binary=os.environ.get('CHROMIUM_BIN') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
        browser=p.chromium.launch(headless=True,executable_path=binary,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1280,'height':900})
        page.route(BASE+'**',handle)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:external.append(r.url) if urlparse(r.url).netloc!='docx.local' else None)
        html=(SITE/'index.html').read_text(encoding='utf-8')
        html=html.replace('<head>','<head><base href="https://docx.local/">',1)
        import re
        html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
        page.set_content(html,wait_until='load')
        page.locator('#docx-file').set_input_files(str(SAMPLE))
        page.locator('#status').get_by_text('미리보기 완료',exact=False).wait_for(timeout=30000)
        pages=page.locator('.docx-page').count()
        page.locator('#clear-button').click()
        cleared=page.locator('.docx-page').count()
        browser.close()
    result={'pages':pages,'pagesAfterClear':cleared,'scriptErrors':errors,'externalRequests':external}
    print(json.dumps(result,ensure_ascii=False))
    assert pages>0 and cleared==0 and not errors and not external,result

if __name__=='__main__':main()
