"""Fast, deterministic content-addressed fixture audit. No network needed."""
from __future__ import annotations
import hashlib
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
CORPUS=ROOT/'tests/corpus'

def load(name):return json.loads((CORPUS/name).read_text(encoding='utf-8'))['cases']

def main():
    cases=load('manifest.json');extras=load('extra-manifest.json');all_cases=cases+extras
    assert len(cases)==45 and len(extras)==6, (len(cases),len(extras))
    assert Counter(c['group'] for c in cases)=={'regression':37,'diagnostics':8}
    assert len(set(c['id'] for c in all_cases))==len(all_cases)
    assert len(set(c['file'] for c in all_cases))==len(all_cases)
    assert not any('kimst' in str(c).lower() or 'real-world' in str(c).lower() for c in all_cases)
    image_count=0
    for case in all_cases:
        path=(ROOT/case['file']).resolve();path.relative_to(ROOT)
        assert path.is_file(),path
        data=path.read_bytes()
        assert hashlib.sha256(data).hexdigest()==case['sha256'],case['id']
        assert len(data)==case['bytes'],case['id']
        with zipfile.ZipFile(path) as archive:
            names=archive.namelist()
            assert 'word/document.xml' in names,case['id']
            assert '[Content_Types].xml' in names,case['id']
            assert all(not name.startswith('/') and '..' not in Path(name).parts for name in names),case['id']
            assert not any(name.lower().endswith(('.vba','vbaproject.bin')) for name in names),case['id']
        if case in cases:
            assert case['expectedRcPages']>=1 and case['wordPages']>=1,case['id']
            imgs=case['wordReferenceImages'];assert len(imgs)==case['wordPages'],case['id']
            for rel in imgs:
                ref=(ROOT/rel).resolve();ref.relative_to(ROOT)
                assert ref.read_bytes()[:8]==b'\x89PNG\r\n\x1a\n',ref
                image_count+=1
    print(f"CORPUS OK: {len(cases)} render DOCX (37 regression, 8 diagnostics), {len(extras)} security/stress DOCX, {image_count} Word PNG references")

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(f'CORPUS FAILED: {error}',file=sys.stderr)
        raise
