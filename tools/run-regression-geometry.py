import argparse, json, math, subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
current_path = root / 'tests' / 'regression' / 'visual' / 'summary.json'
baseline_path = root / 'tests' / 'regression' / 'geometry' / 'baseline.json'

parser = argparse.ArgumentParser()
parser.add_argument('--update', action='store_true')
parser.add_argument('--tolerance', type=float, default=0.25)
args = parser.parse_args()

subprocess.run(['python3', str(root / 'tools' / 'run-regression-visual.py')], cwd=root, check=True, stdout=subprocess.DEVNULL)
current = json.loads(current_path.read_text(encoding='utf-8'))

if args.update or not baseline_path.exists():
    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    baseline_path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'geometry baseline updated: {baseline_path.relative_to(root)}')
    raise SystemExit(0)

baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
errors=[]

def compare(a,b,path='root'):
    if isinstance(a,(int,float)) and not isinstance(a,bool) and isinstance(b,(int,float)) and not isinstance(b,bool):
        if not math.isfinite(float(a)) or not math.isfinite(float(b)) or abs(float(a)-float(b)) > args.tolerance:
            errors.append(f'{path}: {a} != {b} (tol {args.tolerance})')
        return
    if type(a) != type(b):
        errors.append(f'{path}: type {type(a).__name__} != {type(b).__name__}')
        return
    if isinstance(a,dict):
        ak,bk=set(a),set(b)
        for key in sorted(ak-bk): errors.append(f'{path}.{key}: missing from baseline')
        for key in sorted(bk-ak): errors.append(f'{path}.{key}: missing from current')
        for key in sorted(ak&bk): compare(a[key],b[key],f'{path}.{key}')
    elif isinstance(a,list):
        if len(a)!=len(b):
            errors.append(f'{path}: length {len(a)} != {len(b)}')
        for i,(x,y) in enumerate(zip(a,b)): compare(x,y,f'{path}[{i}]')
    elif a != b:
        errors.append(f'{path}: {a!r} != {b!r}')

compare(current, baseline)
if errors:
    print('regression geometry mismatch:')
    for error in errors[:80]: print(' -',error)
    if len(errors)>80: print(f' ... and {len(errors)-80} more')
    raise SystemExit(1)
print(f'regression geometry ok: {len(current)} fixtures, tolerance={args.tolerance}pt')
