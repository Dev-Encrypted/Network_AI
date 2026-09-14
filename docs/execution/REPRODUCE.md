# Reprodução local

Execute os comandos PowerShell na raiz do projeto. Nenhum comando abaixo publica serviços na Internet ou emite créditos. Os diretórios de saída dos experimentos devem ser novos: os programas recusam sobrescrever um run.

## Ferramentas Python e Rust

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e .
.venv\Scripts\python -m unittest discover -s benchmarks/tests -v
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo run --release --locked -- --output benchmarks/runs/nova-medicao-transporte/report.json
```

O transporte inicia e encerra seus próprios endpoints locais. Os testes usam identidades efêmeras, limite de 64 KiB de payload e um protocolo com sequência e SHA-256. O Iroh desativa descoberta e relays. Cancelamento de stream foi observado no Iroh; o protocolo de cancelamento de aplicação libp2p continua pendente.

## Inferência com o modelo já carregado

O comando abaixo reproduz o perfil usado nesta máquina. O identificador deve continuar correspondendo ao modelo já carregado; não usar outro modelo como se fosse o mesmo experimento.

```powershell
.venv\Scripts\python -m network_ai_bench.cli http --base-url http://127.0.0.1:1235 --model 'Qwen3.8-27B / Q4' --samples 30 --max-output-tokens 256 --output benchmarks/runs/novo-smoke-lmstudio
```

As três fixtures são sintéticas. Contadores de saída vêm do backend; SSE e desconexão do cliente não comprovam a agenda de tokens da GPU nem liberação interna de KV.

## Ambiente WSL e Qwen3-8B

Nesta máquina, os ambientes ficam em `/root/.local/share/network-ai/`. Em outro usuário Linux, o instalador usa sua própria pasta pessoal. O script `setup_runtime.py` instala dependências; os demais comandos abaixo usam o ambiente preparado.

```powershell
$LinuxRoot = (wsl -d Ubuntu --exec wslpath -a (Get-Location).Path).Trim()
$LinuxUserHome = (wsl -d Ubuntu --exec sh -c 'printf %s "$HOME"').Trim()
$VllmPython = "$LinuxUserHome/.local/share/network-ai/f0-vllm-0.29.0/bin/python"
wsl -d Ubuntu --exec python3 "$LinuxRoot/benchmarks/scripts/setup_runtime.py" vllm
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/prepare_qwen.py"
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/prepare_e01_fixtures.py"
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/launch_vllm.py" --dry-run --validate-config
```

Após haver GPU disponível, iniciar o servidor numa sessão própria:

```powershell
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/launch_vllm.py"
```

Em outra sessão, executar as cargas preparadas:

```powershell
.venv\Scripts\python -m network_ai_bench.cli profile --base-url http://127.0.0.1:8123 --output benchmarks/runs/novo-qwen-e01
```

O launcher usa BF16, 8.192 tokens totais, uma sequência, 2.048 tokens de prefill em lote, execução eager e fração de memória 0,82. Desativa cache de prefixo, logs de prompts/saídas, código remoto e thinking no template. A fração configurada não substitui medição de pico. As cargas forçam 256/1.024 tokens de decode para medir capacidade; não são avaliações de qualidade semântica.

## Petals privado em CPU

O runtime Petals usa Python 3.10.21, PyTorch 2.2.2 CPU e Transformers 4.43.1, separados do vLLM. O commit Petals é `22afba627a7eb4fcfe9418c49472c6a51334b8ac`. As revisões Hivemind/Multiaddr e demais dependências constam no lock. O constraint de build mantém `pkg_resources`, necessário ao setup antigo do Hivemind.

```powershell
$PetalsPython = "$LinuxUserHome/.local/share/network-ai/f0-petals-py310/bin/python"
wsl -d Ubuntu --exec python3 "$LinuxRoot/benchmarks/scripts/setup_runtime.py" petals
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/prepare_bloom.py"
wsl -d Ubuntu --exec $PetalsPython "$LinuxRoot/benchmarks/scripts/petals_private.py" --output "$LinuxRoot/benchmarks/runs/novo-petals-cpu"
```

BLOOM-560m usa a revisão `ac2ae5fab2ce3f9f40dc79b5ca9f637430d24971`, formato safetensors e licença BigScience BLOOM RAIL 1.0. O teste cria dois servidores, blocos 0–11 e 12–23, com bootstrap exclusivamente em loopback. Compara 30 forwards e três gerações de oito tokens, remove um servidor e verifica a retomada após substituí-lo. A nova chave é autorizada pelo controlador local do experimento. Nada disso comprova recuperação de identidade permissionless.

## Kimi: análise e carregamento parcial

```powershell
.venv\Scripts\python benchmarks/scripts/inspect_kimi.py
wsl -d Ubuntu --exec $VllmPython "$LinuxRoot/benchmarks/scripts/load_kimi_unit.py"
```

A inspeção exige respostas HTTP Range corretas e recusa baixar o shard inteiro por engano. São apenas seis cabeçalhos e os seis tensores de um expert. SHA-256 local de uma fatia não verifica sozinho o digest LFS do shard completo. Os pesos compactados e as escalas U8 não podem ser tratados como um expert de aritmética uint8 comum.

## Economia e verificação dos resultados

```powershell
.venv\Scripts\python -m network_ai_bench.cli economy --phase calibration --workers 4 --output benchmarks/runs/nova-calibracao
.venv\Scripts\python -m network_ai_bench.cli economy --phase holdout --workers 4 --output benchmarks/runs/nova-validacao
.venv\Scripts\python benchmarks/scripts/summarize_economy.py
```

O último comando valida os diretórios históricos datados de 14/09/2026, usados neste incremento. Para um novo estudo, manter manifesto, sementes e resultados em novos caminhos. Repetir o protocolo existente verifica reprodutibilidade; não cria uma nova validação independente para parâmetros ajustados depois.

Os ZIPs v1–v6 de planejamento e suas evidências permanecem históricos. O verificador antigo do planejamento exige uma árvore sem produto; ele não deve ser usado para afirmar que esta nova árvore de execução foi validada integralmente.

Em um clone do GitHub, restaure os dois arquivos brutos e os seis ZIPs históricos antes de usar os verificadores completos. Veja [artefatos da publicação](../publication/README.md). A restauração não substitui o código atual pelo snapshot anterior.

## Integridade e entrega

```powershell
.venv\Scripts\python benchmarks/scripts/verify_execution.py
.venv\Scripts\python benchmarks/scripts/package_execution.py --output NETWORK_AI_EXECUCAO_F0_novo.zip
```

O verificador de execução confere os hashes dos resultados, as fontes vinculadas aos relatórios, contagens, limites das conclusões e os arquivos históricos. Ele não repete as medições nem concede aprovação de lançamento. O empacotador usa uma lista explícita de diretórios, recusa substituir um ZIP existente e relê cada entrada para comparar tamanho e SHA-256.

Os comandos internos de instalação foram usados nos ambientes deste computador. O script agregador `setup_runtime.py` passou por verificação de sintaxe; sua execução completa em uma instalação limpa permanece pendente. Os locks registram versões/revisões, sem constituir auditoria completa das dependências.
