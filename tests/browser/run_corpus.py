"""Actual Chromium openDocx() gate for the public 45-document corpus.

The frozen RC page counts are a regression check.  Word pages are audit data,
not an assertion of Word fidelity or a comparison with upstream docx-preview.
"""
from __future__ import annotations
import argparse
import asyncio
import json
import mimetypes
import os
import time
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
BASE='https://docx.local/'
HTML='''<!doctype html><html lang="en"><head><base href="https://docx.local/"><meta charset="utf-8"/></head>
<body><div id="target"></div><script src="/node_modules/jszip/dist/jszip.min.js"></script>
<script type="module">import {openDocx} from '/src/index.js';
window.__render=async (fixturePath)=>{
  const r=await fetch('/'+fixturePath);if(!r.ok)throw Error('fixture fetch '+r.status);
  const start=performance.now();const data=await r.arrayBuffer();
  const result=await openDocx(data,document.getElementById('target'),{
    parser:{JSZipImpl:window.JSZip},loadEmbeddedFonts:false,waitForFonts:false,changes:{indicators:false}
  });window.__viewer=result;
  const target=document.getElementById('target');
  return {pages:target.querySelectorAll('.docx-page').length,domChars:target.innerText.trim().length,
    elapsedMs:Math.round(performance.now()-start), brokenMedia:Array.from(target.querySelectorAll('img')).filter(i=>!i.complete||i.naturalWidth===0).length,
    scriptElements:target.querySelectorAll('script,iframe,object,embed').length,
    dangerousLinks:target.querySelectorAll('a[href^="javascript:"],img[src^="javascript:"]').length};
};
window.__dispose=()=>{window.__viewer?.dispose();window.__viewer=null;return document.getElementById('target').children.length};
window.__ready=true;
</script></body></html>'''

def corpus():
    c=json.loads((ROOT/'tests/corpus/manifest.json').read_text(encoding='utf-8'))['cases']
    x=json.loads((ROOT/'tests/corpus/extra-manifest.json').read_text(encoding='utf-8'))['cases']
    return c,x

async def main(args):
    cases,extras=corpus()
    if args.group!='all':cases=[c for c in cases if c['group']==args.group]
    if args.include_extras:cases+=extras
    results=[];errors=[];external=[];failed_requests=[]
    async with async_playwright() as p:
        configured=os.getenv('CHROMIUM_BIN')
        local_default='/usr/bin/chromium'
        binary=configured or (local_default if Path(local_default).is_file() else p.chromium.executable_path)
        browser=await p.chromium.launch(headless=True,executable_path=binary,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=await browser.new_page(viewport={'width':1414,'height':2000},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:external.append(r.url) if urlparse(r.url).netloc!='docx.local' else None)
        page.on('requestfailed',lambda r:failed_requests.append(r.url) if urlparse(r.url).netloc=='docx.local' else None)
        async def route_handler(route):
            parsed=urlparse(route.request.url)
            if parsed.scheme!='https' or parsed.netloc!='docx.local':
                await route.abort();return
            if parsed.path=='/':
                await route.fulfill(status=200,body=HTML,content_type='text/html');return
            local=(ROOT/unquote(parsed.path.lstrip('/'))).resolve()
            try:local.relative_to(ROOT)
            except ValueError:
                await route.abort();return
            if not local.is_file():
                await route.fulfill(status=404,body='missing');return
            mime=mimetypes.guess_type(local.name)[0] or 'application/octet-stream'
            if local.suffix in ('.js','.mjs'):mime='application/javascript'
            await route.fulfill(status=200,body=local.read_bytes(),content_type=mime)
        await page.route('**/*',route_handler)
        await page.set_content(HTML,wait_until='load')
        await page.wait_for_function('window.__ready===true',timeout=20000)
        for case in cases:
            result={'id':case['id'],'group':case['group'],'file':case['file']}
            started=time.monotonic()
            try:
                metrics=await page.evaluate('p=>window.__render(p)',case['file'])
                result.update(metrics)
                result['expectedRcPages']=case.get('expectedRcPages')
                result['wordPages']=case.get('wordPages')
                errs=[]
                if metrics['pages']<1:errs.append('no rendered pages')
                if metrics['domChars']<1:errs.append('no rendered DOM text')
                if metrics['brokenMedia']>0:errs.append('broken media')
                if metrics['scriptElements']>0:errs.append('unexpected active markup')
                if metrics['dangerousLinks']>0:errs.append('unsafe URL attributes')
                if case.get('expectedRcPages') and metrics['pages']!=case['expectedRcPages']:
                    errs.append(f"RC page count {metrics['pages']} != {case['expectedRcPages']}")
                if args.max_render_ms and metrics['elapsedMs']>args.max_render_ms:
                    errs.append(f"render duration {metrics['elapsedMs']}ms > {args.max_render_ms}ms")
                result['remainingChildren']=await page.evaluate('window.__dispose()')
                if result['remainingChildren']!=0:errs.append('dispose left DOM children')
                result['status']='PASS' if not errs else 'FAIL'
                if errs:result['errors']=errs
            except Exception as exc:
                result.update(status='FAIL',errors=[str(exc)[:400]])
                try:await page.evaluate('window.__dispose()')
                except Exception:pass
            result['wallMs']=int((time.monotonic()-started)*1000)
            results.append(result)
            print(f"{result['status']:4} {case['id']:51} pages={result.get('pages','?')} expected={result.get('expectedRcPages','-')} time={result.get('wallMs')}ms",flush=True)
        await browser.close()
    summary={
        'schemaVersion':1,'baseline':'Phase 48-AY frozen RC page counts',
        'total':len(results),'passed':sum(x['status']=='PASS' for x in results),
        'errors':errors,'externalRequests':external,'failedRequests':failed_requests,'results':results,
        'note':'Word page counts are observational; this is not a pass on Word parity or upstream docx-preview superiority.'
    }
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"CORPUS: {summary['passed']}/{summary['total']} PASS; page errors={len(errors)} external requests={len(external)} failed resources={len(failed_requests)}; result={out}")
    if summary['passed']!=summary['total'] or errors or external or failed_requests:
        raise SystemExit(1)

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--group',choices=['all','regression','diagnostics'],default='all')
    ap.add_argument('--include-extras',action='store_true')
    ap.add_argument('--max-render-ms',type=int,default=0,help='Optional relaxed performance upper bound; 0 disables')
    ap.add_argument('--output',default=str(ROOT/'tests/results/browser-corpus.json'))
    asyncio.run(main(ap.parse_args()))
