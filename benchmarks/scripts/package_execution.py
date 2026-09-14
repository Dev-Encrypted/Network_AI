"""Create an immutable source/evidence ZIP from an explicit local allowlist."""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
import argparse
import json

from verify_execution import ROOT, HISTORICAL, digest, require, validate


def package(output):
    output = Path(output).resolve()
    require(output.parent == ROOT, 'Write the delivery ZIP directly in the workspace root')
    require(not output.exists(), 'Refusing to overwrite an existing delivery ZIP')
    validation = validate()
    (ROOT / 'docs/execution/evidence/execution-validation.json').write_text(json.dumps(validation, indent=2), encoding='utf-8')
    fixed = ['README.md', '.gitignore', 'pyproject.toml', 'Cargo.toml', 'Cargo.lock',
             'benchmarks/README.md', 'benchmarks/economy-study-v1.json',
             'benchmarks/petals-constraints.txt', 'benchmarks/petals-build-constraints.txt', *HISTORICAL]
    roots = ['docs/planning', 'docs/execution', 'crates/transport-bench', 'benchmarks/python/network_ai_bench',
             'benchmarks/scripts', 'benchmarks/tests', 'benchmarks/fixtures']
    roots += [str(path.relative_to(ROOT)) for path in sorted((ROOT / 'benchmarks/runs').glob('2026-09-14-*')) if path.is_dir()]
    selected = {ROOT / name for name in fixed}
    for directory in roots:
        for path in (ROOT / directory).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
                require(not path.is_symlink(), 'Do not package symlinks')
                selected.add(path)
    files = sorted(selected)
    manifest = []
    for path in files:
        require(path.is_file() and path.resolve().is_relative_to(ROOT), 'Missing or external artifact: ' + str(path))
        name = path.relative_to(ROOT).as_posix()
        require(not any(part in ('.git', '.venv', '.runtime', '.models', 'node_modules', 'target') for part in path.relative_to(ROOT).parts), 'Excluded runtime path found')
        require(not path.name.startswith('.env'), 'Environment files must not be packaged')
        manifest.append({'path': name, 'bytes': path.stat().st_size, 'sha256': digest(path)})
    manifest_bytes = json.dumps({'created_at_utc': datetime.now(timezone.utc).isoformat(),
                                  'public_launch_approved': False, 'files': manifest}, indent=2).encode()
    with ZipFile(output, 'x', compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for path, record in zip(files, manifest):
            archive.write(path, record['path'], compress_type=ZIP_STORED if path.suffix in ('.gz', '.zip') else ZIP_DEFLATED)
        archive.writestr('EXECUTION-MANIFEST.json', manifest_bytes)
    with ZipFile(output) as archive:
        require(len(archive.namelist()) == len(manifest) + 1, 'Unexpected ZIP entry count')
        require(archive.read('EXECUTION-MANIFEST.json') == manifest_bytes, 'Manifest changed')
        from hashlib import sha256
        for record in manifest:
            data = archive.read(record['path'])
            require(len(data) == record['bytes'] and sha256(data).hexdigest() == record['sha256'], 'ZIP readback mismatch: ' + record['path'])
    result = {'archive': output.name, 'bytes': output.stat().st_size, 'sha256': digest(output),
              'files': len(manifest) + 1, 'manifest_entries': len(manifest), 'all_entries_readback_verified': True,
              'public_launch_approved': False, 'excluded': ['Model weights', 'Installed Python/WSL runtimes', 'Rust build cache and binaries',
                                                         'Git metadata', 'Environment secrets', 'Unrelated user outputs']}
    sidecar = output.with_suffix('.verification.json')
    with sidecar.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'NETWORK_AI_EXECUCAO_F0_2026-09-14_v1.zip'))
    package(parser.parse_args().output)
