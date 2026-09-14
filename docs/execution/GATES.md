# Estado dos gates após o primeiro incremento

| Gate | Estado | O que falta |
|---|---|---|
| FC01 — Coerência dos contratos | Referência v6 preservada; implementação parcial em bancada | Revisão do protocolo executável completo e sua persistência/concorrência |
| FC02 — Economia e liquidez | Ensaio de eventos executado; parâmetros reprovados | Nova calibração, comportamento/custo medidos, elasticidade e avaliador de recuperação completos |
| FC03 — Capacidade e troca | Evidência local parcial | Qwen3-8B em GPU disponível, segundo host físico, outras GPUs e relação real contribuição/consumo |
| FC04 — Comércio opcional | Não executado | Adaptador de teste, vendedor, liquidação, repasses, contestação e saída |
| FC05 — Confiança e continuidade | Transporte local exercitado | Quatro operadores independentes, quorum 3, fraude/atestação, restauração e substituição reais |
| FC06 — Piloto e abertura | Não autorizado por evidência | Custeio confirmado, responsáveis e campanhas reais de 7/30 dias |

## Dependências concretas

O lançador Qwen3-8B está preparado e seu parser foi validado contra o vLLM instalado. Ele exige pelo menos 21.504 MiB livres na GPU 0 antes de iniciar. No preflight havia aproximadamente 1,9 GiB livres, com o modelo do LM Studio carregado. A sessão existente permanece ativa; descarregá-la e restaurá-la depende da resposta do usuário à pergunta já apresentada.

Um segundo computador físico e seu acesso também foram solicitados. Ainda não foi informado outro host. WSL, processos locais e conexões loopback não satisfazem esse requisito.

Não há cluster compatível confirmado para a referência completa Kimi K3. A análise e o carregamento parcial prosseguiram, mas não sustentam alegações de paridade completa, latência WAN ou soma de VRAM utilizável.

## Escopo que continua proibido pelos gates

Os TU do simulador são números de laboratório. Não configurar saldos reais com eles, copiar seu estado inicial para um gênese, prometer rendimento a contribuidores ou aceitar pagamentos com base nos preços fictícios. Não reduzir saldos existentes para corrigir o experimento.

Não anunciar suporte a qualquer GPU/modelo apenas por haver um registro de catálogo. Abertura de nós, licenciamento, compatibilidade da engine, rota física completa, isolamento e orçamento permanecem verificações distintas.

O próximo incremento de produto é uma rede privada funcional, condicionada a um perfil medido. A reprovação econômica não impede continuar a pesquisa de inferência; impede ativar a economia pública com os parâmetros reprovados.
