# Instalação, operação e recuperação

## Inicializar

Execute na raiz do repositório, com Node.js 24.13.0, pnpm 10.33.0, Rust 1.93.1 e Docker/Compose disponíveis:

```powershell
pnpm install --frozen-lockfile
pnpm lab:init
pnpm lab:start
```

`lab:init` cria exclusivamente o projeto Compose `network-ai-private-lab`, seu PostgreSQL e volume. Gera senhas e chaves criptográficas, aplica migrações por checksum e cria o administrador. Repetir o comando preserva identidades e dados; não repete a concessão de bootstrap. O laboratório concede explicitamente 100 LAB_TU para os primeiros testes. Novos usuários começam com zero.

O perfil admite uma instalação por computador. Se outro checkout encontrar o banco já existente sem a configuração privada correspondente, a inicialização para antes de gerar novas credenciais ou recriar o container. Restaure a configuração original; não substitua senhas sobre um volume existente.

Todos os segredos ficam em `.runtime/private-lab/`, ignorado pelo Git. No Windows, a pasta recebe ACL para o usuário que executa o comando; no Linux, modo 0700. O arquivo `credentials.txt` contém o acesso inicial. Nunca publique essa pasta, dumps, logs privados ou chaves exibidas pela interface.

`lab:start` compila os serviços e inicia processos em segundo plano, sem abrir janelas de terminal. Após uma compilação já validada, `pnpm lab:start --no-build` reutiliza os binários. Para atualizar código com serviços rodando, use primeiro `pnpm lab:stop`, depois compile e inicie. Compilar Next.js sobre a pasta de uma instância em execução pode deixar seus arquivos estáticos inconsistentes.

| Serviço | Endereço local |
|---|---|
| Interface | `http://127.0.0.1:43100` |
| Controle | `http://127.0.0.1:43101/api/v1` |
| Gateway | `http://127.0.0.1:43102/v1` |
| Agente inicial | `http://127.0.0.1:43103` |
| PostgreSQL | `127.0.0.1:54329` |

Os listeners da aplicação e a publicação da porta do banco usam loopback. A faixa de nós é 43103–43299. Não altere o bind para abrir este perfil na Internet: TLS/WAN, antifraude, proteção de operadores e continuidade distribuída ainda não foram qualificados.

## Operar pela interface

1. Entre usando as credenciais privadas.
2. Em **Conversar**, selecione um modelo disponível. A cotação reserva o teto de custo; o recibo liquida o uso e devolve a diferença.
3. Em **Sessões**, consulte estado, motivo de interrupção, tokens e cobrança. O histórico não permite reabrir respostas antigas, pois o conteúdo não é retido.
4. Em **Acesso à API**, crie uma chave individual e salve a cópia exibida uma única vez. Revogar interrompe novas autenticações com ela.
5. Em **Meus nós**, pause novas admissões ou retome o agente. A execução já iniciada pode terminar.
6. Em **Administração**, provisione usuários, concessões de teste, domínios físicos, convites e qualificação dos manifestos.

## Conectar outro modelo ou agente

Qualquer membro pode registrar um manifesto de texto, com identificador imutável, revisão, SHA-256, licença, origem HTTPS, limites e tarifas. Ele entra como `CANDIDATE`. O administrador registra a evidência e o habilita como `LOCAL_PREVIEW` após conferir o artefato e a engine. O sistema não executa código do repositório do modelo, não baixa pesos e não interpreta ferramentas ou multimodalidade.

Cadastre um domínio para o recurso físico. Reutilize o mesmo domínio para dois agentes que compartilham a mesma GPU. A capacidade declarada deve ser medida pelo operador; este coordenador não prova a topologia física.

Gere um convite na interface, usando a porta local escolhida. Salve a resposta JSON em um arquivo privado com os campos `id` e `invite`. Gere o perfil limitado do operador:

```powershell
node scripts/node-config.mjs --invite-file .runtime/convite.json --backend-model "identificador-exato-no-servidor" --port 43104 --backend-url http://127.0.0.1:1235 --backend-kind lmstudio
```

O comando informa o caminho de um novo `config.json`, sem senhas de banco, senha administrativa ou chave privada do coordenador. Defina `NETWORK_AI_CONFIG` para esse caminho e inicie o agente em um terminal de operação:

```powershell
$env:NETWORK_AI_CONFIG = "CAMINHO_PRIVADO_INFORMADO_PELO_COMANDO"
.\target\debug\network-ai-node.exe
```

No Linux, o executável é `./target/debug/network-ai-node`. O backend deve coincidir com o manifesto vinculado ao convite. Um agente atende um modelo configurado e mantém um slot local. Vários modelos usam agentes separados e compartilham o domínio quando disputam o mesmo hardware.

`lmstudio` verifica `loaded_instances`, porque `/v1/models` também pode listar modelos descarregados. `openai` permite testar um servidor compatível via `/v1/models`; essa listagem é uma declaração do backend, não prova de residência em memória ou de capacidade. É necessário validar esse adaptador no servidor utilizado antes de habilitá-lo.

O perfil inicial `qwen-local` corresponde à bancada desta estação, com hash e ressalva de origem/licença no manifesto. Em outro computador, publique seu próprio manifesto em vez de reutilizar esse fingerprint para pesos diferentes. Pesos proprietários, engines comerciais e modelos de terceiros não recebem a licença do NETWORK AI.

## Estado, parada e recuperação

```powershell
pnpm lab:status
node scripts/lab.mjs restart node
node scripts/lab.mjs restart control
pnpm lab:stop
```

O gerenciador só encerra PIDs cujo comando corresponde ao projeto. `stop` mantém o banco, o volume e os arquivos privados. Não atua em outros projetos Docker. Um reinício abrupto do agente incrementa sua época; o controle invalida tentativas da época anterior e devolve suas reservas. A engine externa recebe a interrupção da conexão; a liberação efetiva de seus recursos depende dela.

Durante uma indisponibilidade curta do controle, o nó grava recibos em outbox antes de tentar enviá-los. Retoma o envio sem repetir cobrança. Uma falha de gravação impede novas admissões naquele processo até a correção e o reinício. A janela máxima de execução é 180 segundos e a fila expira em 120 segundos. Fora dessas janelas, o controle devolve a reserva e encerra a tentativa; não tenta continuar uma geração de tokens de onde parou.

## Backup

```powershell
pnpm lab:backup
pnpm test:backup
```

O dump vai para `.runtime/private-lab/backups/`. Contém usuários, hashes de acesso e todo o histórico contábil; trate-o como arquivo privado. O verificador restaura em um banco novo dentro do PostgreSQL deste projeto, confere journal, projeção e permissões e remove somente esse banco temporário. Não substitui o banco de trabalho.

Uma recuperação integral também exige uma cópia protegida de `config.json` e das identidades dos agentes, incluindo outboxes. Um dump sozinho não recupera as chaves Ed25519. A troca do banco de trabalho deve ser uma operação planejada, com serviços parados e o destino verificado. Este inicializador não faz restauração destrutiva automática.

## Validação

```powershell
pnpm build
pnpm test:integration
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:live
pnpm test:faults
pnpm test:outbox
pnpm test:multi-node
pnpm test:backup
```

Os testes de navegador completos e os três testes `live`, `faults` e `outbox` usam o modelo real já carregado. Os testes de falha reiniciam apenas o serviço indicado deste projeto; execute sem outras sessões de usuário em andamento. A integração cria um banco descartável e testa o PostgreSQL real, sem GPU. A CI executa a integração e as jornadas de navegador que não dependem da engine. Consulte a [cobertura](STATUS.md) antes de interpretar um resultado como qualificação de produção.
