# Executable F0 research bench

This directory contains measurement and simulation tools. It does not issue public credits or create commercial offers. The integrated private application has a separate [manual](../docs/implementation/README.md).

Python reference version: 3.12. Create a virtual environment and install the local package. The HTTP harness uses the standard library; numerical dependencies and engines use separate environments.

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e .
.venv\Scripts\python -m unittest discover -s benchmarks/tests -v
```

On Linux, use `python3.12 -m venv .venv` and `.venv/bin/python`. Commands and evidence are consolidated in [F0 execution](../docs/execution/README.md) and [reproduction](../docs/execution/REPRODUCE.md).

The public run directories include reports and selected samples/logs, including failed attempts. Large raw economic archives belong to the [research release](../docs/publication/README.md). Source hashes bind the accepted reports to their harness versions. Some early failed runs do not have a recoverable exact copy of their previous harness; their limitations remain explicit.

Distinguish actual inference, loopback transport, partial tensor loading, arithmetic and economic simulation. Two connections on the same computer are not two physical hosts. Small-model parity does not qualify a distributed model above 27B. No F0 harness result independently opens public launch gates.
