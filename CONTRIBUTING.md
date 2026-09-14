# Contribuir com o NETWORK AI

O projeto está em pesquisa e bancada F0. Comece pelos [resultados](docs/execution/README.md) e [critérios pendentes](docs/execution/GATES.md). Preserve a reprovação econômica e o histórico que a sustenta.

## Fluxo

1. Descreva problema, hipótese e critério de aceite em uma issue ou pull request.
2. Faça uma alteração delimitada. Use diretórios novos para novos experimentos.
3. Execute testes apropriados e informe ambiente, comandos, resultado e limitações.
4. Explique efeitos sobre contratos, consumo, falhas e compatibilidade.

Após instalar o pacote conforme [Reprodução](docs/execution/REPRODUCE.md):

```bash
python -m unittest discover -s benchmarks/tests -v
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Medições de GPU e de rede física não são executadas pela automação básica.

## Evidência

Separe medição, simulação e projeção. Declare revisão do modelo, engine, driver, contexto, concorrência e número de hosts. Um erro corrigido exige execução nova; não substitua o resultado anterior para aparentar sucesso.

Políticas ajustadas após observar o holdout precisam de novas sementes de validação. Mantenha recusas elegíveis no denominador do SLO e exponha saldos retidos, compromissos e fluxos entre grupos.

Não envie credenciais, prompts de terceiros, dados pessoais, pesos ou ambientes instalados. Artefatos grandes de pesquisa vão para releases com seus hashes.

## Direitos das contribuições

Envie apenas material que você pode licenciar. Código original segue Apache 2.0; texto original segue CC BY 4.0. Preserve avisos de terceiros e informe a origem. Ao enviar uma contribuição para inclusão, você a oferece sob a licença correspondente, sem cessão automática de titularidade ao mantenedor.

O responsável pela direção é [Dev-Encrypted](AUTHORS.md). Relatos de segurança seguem [SECURITY.md](SECURITY.md).
