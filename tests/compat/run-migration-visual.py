from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes, json
root=Path('/mnt/data/phase48ad_work')
out=Path('/mnt/data/docx_phase48ad_results'); out.mkdir(exist_ok=True)
html=(root/'tests/compat/migration-visual.html').read_text()

def file_for(url):
    pre='https://docx.local/'
    if not url.startswith(pre): return None
    p=(root/url[len(pre):].split('?',1)[0]).resolve()
    try: p.relative_to(root.resolve())
    except: return None
    return p if p.is_file() else None

def route_handler(route):
    p=file_for(route.request.url)
    if not p: return route.abort()
    route.fulfill(status=200,body=p.read_bytes(),content_type=mimetypes.guess_type(str(p))[0] or 'application/octet-stream')

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1600,'height':900},device_scale_factor=1)
    page.route('https://docx.local/**',route_handler)
    # set a virtual base so relative imports/fetches resolve through the route handler
    page.set_content(html,wait_until='load')
    page.wait_for_function('window.__READY__===true',timeout=30000)
    res=page.evaluate('window.__RESULT__')
    page.screenshot(path=str(out/'docx-preview-migration-browser.png'),full_page=True)
    browser.close()
(out/'migration-browser-results.json').write_text(json.dumps(res,ensure_ascii=False,indent=2))
print(json.dumps(res,ensure_ascii=False))
