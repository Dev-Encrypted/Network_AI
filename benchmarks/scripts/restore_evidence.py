"""Restore only eight pinned historical artifacts, without replacing current code."""
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import os
import tempfile
import urllib.request

from verify_execution import ROOT, HISTORICAL, digest, require

ASSET = 'NETWORK_AI_EXECUCAO_F0_2026-09-14_v1.zip'
ASSET_BYTES = 86326026
ASSET_SHA256 = '5d6afd3b991b9938b9f8840266f2fef7fb5c10324f11265b6f8fc7872a55eca1'
URL = 'https://github.com/Dev-Encrypted/Network_AI/releases/download/v0.1.0-f0/' + ASSET


def download():
    cache = ROOT / '.runtime/evidence-downloads'
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / ASSET
    if target.exists():
        require(digest(target) == ASSET_SHA256, 'Existing cached ZIP has a different hash')
        return target
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as stream:
            temporary = Path(stream.name)
            total = 0
            with urllib.request.urlopen(URL, timeout=60) as response:
                while block := response.read(1024 * 1024):
                    total += len(block)
                    require(total <= ASSET_BYTES, 'Download exceeded the pinned byte count')
                    stream.write(block)
        require(temporary.stat().st_size == ASSET_BYTES and digest(temporary) == ASSET_SHA256, 'Download integrity check failed')
        # Exclusive creation avoids replacing another download.
        with target.open('xb') as output, temporary.open('rb') as source:
            while block := source.read(1024 * 1024):
                output.write(block)
        return target
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def restore(archive_path, destination):
    require(digest(archive_path) == ASSET_SHA256, 'Archive hash mismatch')
    destination = Path(destination).resolve()
    expected = dict(HISTORICAL)
    for phase in ('calibration', 'holdout'):
        folder = f'benchmarks/runs/2026-09-14-economy-v1-{phase}'
        report = json.loads((ROOT / folder / 'report.json').read_text())
        expected[folder + '/runs.jsonl.gz'] = report['raw_sha256']
    pending = []
    with ZipFile(archive_path) as archive:
        for name, fingerprint in expected.items():
            target = destination / name
            require(target.resolve().is_relative_to(destination), 'Artifact path escaped destination')
            if target.exists():
                require(target.is_file() and digest(target) == fingerprint, 'Existing artifact differs; left untouched: ' + name)
                continue
            info = archive.getinfo(name)
            require(info.file_size <= 100 * 1024 * 1024, 'Unexpected artifact size')
            with archive.open(name) as source:
                result = sha256()
                while block := source.read(1024 * 1024):
                    result.update(block)
            require(result.hexdigest() == fingerprint, 'Contained artifact hash mismatch: ' + name)
            pending.append((name, target))
        for name, target in pending:
            target.parent.mkdir(parents=True, exist_ok=True)
            require(target.parent.resolve().is_relative_to(destination), 'Artifact parent escaped destination')
            with target.open('xb') as output, archive.open(name) as source:
                while block := source.read(1024 * 1024):
                    output.write(block)
    print(json.dumps({'verified_artifacts': len(expected), 'restored': len(pending),
                      'current_sources_replaced': False, 'public_network_operation_approved': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--destination', type=Path, default=ROOT)
    args = parser.parse_args()
    if args.download and args.archive:
        parser.error('Choose --download or --archive')
    asset = download() if args.download else (args.archive or ROOT / ASSET)
    restore(asset, args.destination)
