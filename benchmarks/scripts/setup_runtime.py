"""Reproduce isolated Linux/WSL runtimes without modifying system Python."""
from pathlib import Path
import argparse
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
BASE=Path.home()/'.local/share/network-ai'
PETALS_COMMIT='22afba627a7eb4fcfe9418c49472c6a51334b8ac'


def run(args,cwd=None):
    subprocess.run([str(a) for a in args],cwd=cwd,check=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('runtime',choices=('vllm','petals'))
    args=parser.parse_args()
    if sys.platform!='linux':parser.error('run this script inside Ubuntu/WSL')
    BASE.mkdir(parents=True,exist_ok=True)
    if args.runtime=='vllm':
        venv=BASE/'f0-vllm-0.29.0'
        if not venv.exists():run(['python3.12','-m','venv',venv])
        run([venv/'bin/python','-m','pip','install','--disable-pip-version-check','-r',ROOT/'docs/execution/evidence/vllm-0.29.0-python312.lock.txt'])
    else:
        tooling=BASE/'tooling'
        if not tooling.exists():run(['python3.12','-m','venv',tooling])
        run([tooling/'bin/python','-m','pip','install','uv==0.12.13'])
        uv=tooling/'bin/uv'
        run([uv,'python','install','3.10.21'])
        venv=BASE/'f0-petals-py310'
        if not venv.exists():run([uv,'venv','--python','3.10.21',venv],cwd=BASE)
        source=ROOT/'.runtime/sources/petals'
        if not source.exists():
            source.mkdir(parents=True)
            run(['git','init',source])
            run(['git','-C',source,'remote','add','origin','https://github.com/bigscience-workshop/petals.git'])
            run(['git','-C',source,'fetch','--depth','1','origin',PETALS_COMMIT])
            run(['git','-C',source,'checkout','--detach','FETCH_HEAD'])
        revision=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
        if revision!=PETALS_COMMIT:raise ValueError('existing Petals checkout has a different revision; left untouched')
        run([uv,'pip','install','--python',venv/'bin/python','--index-url','https://download.pytorch.org/whl/cpu','torch==2.2.2+cpu'])
        frozen=(ROOT/'docs/execution/evidence/petals-python310.lock.txt').read_text()
        frozen='\n'.join('petals @ '+source.as_uri() if line.startswith('petals @ ') else line for line in frozen.splitlines())+'\n'
        requirements=ROOT/'.runtime/petals-reproduce.txt';requirements.write_text(frozen)
        run([uv,'pip','install','--python',venv/'bin/python','--build-constraint','benchmarks/petals-build-constraints.txt',
             '-r','.runtime/petals-reproduce.txt'],cwd=ROOT)
    print(str(venv))


if __name__=='__main__':main()
