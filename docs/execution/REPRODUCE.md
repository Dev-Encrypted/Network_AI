# Reproduce the F0 bench

Run commands from the repository root. Examples use PowerShell unless labeled otherwise. New experiments require new output directories; do not overwrite historical runs. Model downloads and engine setup are separate from source-only checks and must respect the model's own terms.

## Source-only validation

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e .
.venv\Scripts\python -m unittest discover -s benchmarks/tests -v
.venv\Scripts\python benchmarks/scripts/verify_repository.py
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

On Linux use `python3.12 -m venv .venv` and `.venv/bin/python`. These checks do not download model weights or qualify physical hardware. The current Cargo workspace includes the private runtime as well as the transport bench.

## Authenticated loopback transport

Select the transport package explicitly in the multi-package workspace:

```powershell
cargo run --release --locked -p network-ai-transport-bench -- --output benchmarks/runs/new-transport-measurement/report.json
```

The bench starts and stops its own local endpoints. It uses ephemeral identities, a 64 KiB payload limit, sequence numbers and SHA-256. Iroh discovery and relays are disabled. Iroh stream cancellation was observed; application-level libp2p cancellation remains outside the implemented bench protocol.

## Existing LM Studio profile

This command reproduces the original station's model identifier. Prepare that exact artifact if comparing its result; another model requires a separately named run.

```powershell
.venv\Scripts\python -m network_ai_bench.cli http --base-url http://127.0.0.1:1235 --model 'Qwen3.8-27B / Q4' --samples 30 --max-output-tokens 256 --output benchmarks/runs/new-lmstudio-smoke
```

The three prompts are synthetic fixtures. Output counts come from the backend. SSE completion and client disconnect do not independently prove GPU token scheduling or internal KV release. The corrected report distinguishes reasoning from visible response content.

The project's focus is models above 27B; this historical 27B run is a local reference, not distributed larger-model qualification.

## WSL and official Qwen3-8B preparation

The installer places environments in the Linux user's `.local/share/network-ai/` directory. The original machine used its own account there; that account's absolute path is not a prerequisite for another installation.

```powershell
$LinuxRoot = (wsl -d Ubuntu --exec wslpath -a (Get-Location).Path).Trim()
$LinuxUserHome = (wsl -d Ubuntu --exec sh -c 'printf %s "$HOME"').Trim()
$VllmPython = "$LinuxUserHome/.local/share/network-ai/f0-vllm-0.29.0/bin/python"
wsl -d Ubuntu --exec python3 "$LinuxRoot/benchmarks/scripts/setup_runtime.py" vllm
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/prepare_qwen.py"
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/prepare_e01_fixtures.py"
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/launch_vllm.py" --dry-run --validate-config
```

With sufficient available GPU memory, start the server in its own session:

```powershell
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/launch_vllm.py"
```

Run the prepared workloads from another session:

```powershell
.venv\Scripts\python -m network_ai_bench.cli profile --base-url http://127.0.0.1:8123 --output benchmarks/runs/new-qwen-e01
```

The launcher uses BF16, 8,192 total tokens, one sequence, a 2,048-token batched prefill limit, eager execution and memory fraction 0.82. It disables prefix caching, prompt/output logging, remote model code and thinking in the template. A configured fraction is not a measured peak. Workloads force 256/1,024 decode tokens to measure capacity; they are not semantic-quality evaluations.

The recorded preflight required 21,504 MiB free, which the shared GPU did not have. Consequently the official BF16 run remains unexecuted in the published campaign.

## Private Petals CPU reference

The isolated environment uses Python 3.10.21, PyTorch 2.2.2 CPU and Transformers 4.43.1, separate from vLLM. The recorded Petals commit is `22afba627a7eb4fcfe9418c49472c6a51334b8ac`. Hivemind/Multiaddr revisions and other dependencies appear in the lock/constraints. The build constraint retains `pkg_resources` for the older setup path.

After the WSL variables above are defined:

```powershell
$PetalsPython = "$LinuxUserHome/.local/share/network-ai/f0-petals-py310/bin/python"
wsl -d Ubuntu --exec python3 "$LinuxRoot/benchmarks/scripts/setup_runtime.py" petals
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/prepare_bloom.py"
wsl -d Ubuntu --exec $PetalsPython "$LinuxRoot/benchmarks/scripts/petals_private.py" --output "$LinuxRoot/benchmarks/runs/new-petals-cpu"
```

BLOOM-560m uses revision `ac2ae5fab2ce3f9f40dc79b5ca9f637430d24971`, safetensors and the upstream BLOOM RAIL 1.0 license. The experiment creates servers for blocks 0–11 and 12–23 with loopback bootstrap, compares 30 forwards and three eight-token generations, removes a server and checks recovery after replacement. The local controller authorizes the new identity. This is not permissionless identity recovery or a WAN test.

## Kimi inspection and partial loading

```powershell
.venv\Scripts\python benchmarks/scripts/inspect_kimi.py
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/load_kimi_unit.py"
```

The inspector requires correct HTTP Range behavior and refuses accidental whole-shard downloads. It inspects six headers and the six tensors of one expert. A local hash of a slice does not verify the whole shard's LFS digest. Packed weights and U8 scales are not evidence of a valid ordinary uint8 expert computation.

## Economic simulations

```powershell
.venv\Scripts\python -m network_ai_bench.cli economy --phase calibration --workers 4 --output benchmarks/runs/new-calibration
.venv\Scripts\python -m network_ai_bench.cli economy --phase holdout --workers 4 --output benchmarks/runs/new-holdout
```

These commands rerun the registered study. They check reproducibility, not a fresh independent validation of parameters adjusted after observing the original holdout. A revised study needs a new manifest, new seeds and new paths.

`summarize_economy.py` targets the historical dated directories and regenerates their summary. Use a disposable research checkout when regenerating historical outputs; it does not automatically analyze arbitrary new output paths. Do not overwrite a published result to conceal a failed variant.

## Restore and check complete historical evidence

A normal source clone excludes the two large economic raw archives and six historical planning ZIPs. Restore only those assets:

```powershell
.venv\Scripts\python benchmarks/scripts/restore_evidence.py --download
.venv\Scripts\python benchmarks/scripts/verify_execution.py --check
```

For a previously downloaded package use `--archive path-to-package.zip` instead of `--download`. The restorer checks size and SHA-256 and accepts only eight known paths. It preserves current code and documents and refuses conflicting existing artifacts.

`--check` validates without rewriting the historical consistency report. It checks source/data hashes, sample counts, original planning-source hashes inside the archive, unchanged non-Markdown planning evidence, and explicit qualification limits. It does not rerun GPU experiments or approve public operation.

The English edition's prose is separate from the original Portuguese source. The legacy planning verifier and SHA256SUMS belong to the archived tree. Use an isolated original snapshot to reproduce those exact checks. [Archive provenance](../publication/README.md).

## Packaging and installation limits

The existing `package_execution.py` is a historical F0 packager with its original narrow source allowlist. It is not the current private-application release builder. Use immutable release assets for the original bench and Git source archives for the current complete repository; do not generate a modern full-product release with the old packager.

The original aggregate runtime setup script was syntax checked, but its full execution on a completely clean machine was not part of the recorded F0 campaign. Dependency pins make the intended versions explicit without constituting a complete supply-chain or license audit.
