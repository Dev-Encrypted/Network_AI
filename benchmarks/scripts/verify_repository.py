"""Validate the public checkout without downloading models or release assets."""
from hashlib import sha256
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def main():
    raw = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    names = sorted(set(name.decode('utf-8') for name in raw.split(b'\0') if name))
    errors = []
    documents = 0
    links = 0
    for name in names:
        path = ROOT / name
        if not path.is_file():
            errors.append('Missing listed file: ' + name)
            continue
        if path.stat().st_size > 20 * 1024 * 1024:
            errors.append('Large file belongs in release assets: ' + name)
        if any(part in ('.git', '.venv', '.runtime', '.models', 'target', 'node_modules', '__pycache__') for part in Path(name).parts):
            errors.append('Private runtime/cache included: ' + name)
        if path.name.startswith('.env') and path.name != '.env.example':
            errors.append('Environment file included: ' + name)
        if path.suffix != '.md':
            continue
        documents += 1
        text = path.read_text(encoding='utf-8-sig')
        if len(re.findall(r'^```', text, re.MULTILINE)) % 2:
            errors.append('Unbalanced code fence: ' + name)
        prose = re.sub(r'(?ms)^```.*?^```[^\n]*\n?', '', text)
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', prose):
            target = target.strip('<>')
            if urlsplit(target).scheme or target.startswith('#'):
                continue
            relative = unquote(target.split('#')[0])
            resolved = (path.parent / relative).resolve()
            if not resolved.is_relative_to(ROOT) or not resolved.exists():
                errors.append(f'Broken local link: {name}: {target}')
            links += 1
    for required in ('LICENSE', 'LICENSES/CC-BY-4.0.txt', 'NOTICE', 'AUTHORS.md', 'CITATION.cff',
                     'docs/ARTICLE.md', 'docs/README.md', 'docs/publication/README.md'):
        if required not in names:
            errors.append('Missing public entry point: ' + required)
    for phase in ('calibration', 'holdout'):
        report = json.loads((ROOT / f'benchmarks/runs/2026-09-14-economy-v1-{phase}/report.json').read_text())
        for source, expected in report['source_sha256'].items():
            actual = sha256((ROOT / 'benchmarks/python/network_ai_bench' / source).read_bytes()).hexdigest()
            if actual != expected:
                errors.append('Economic source differs from preserved run: ' + source)
    if errors:
        raise SystemExit('\n'.join(errors))
    print(json.dumps({'status': 'passed', 'files': len(names), 'markdown_documents': documents,
                      'relative_links_checked': links, 'economic_source_hashes_match': True,
                      'public_network_operation_approved': False}))


if __name__ == '__main__':
    main()
