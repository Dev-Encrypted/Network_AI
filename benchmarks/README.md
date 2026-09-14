# Bancada executável

A implementação começa pela F0. Este diretório contém ferramentas de medição e simulação; não publica créditos ou ofertas comerciais.

Python de referência: 3.12. Crie o ambiente com `py -3.12 -m venv .venv` e instale com `.venv/Scripts/python -m pip install -e .`. O harness de HTTP usa somente a biblioteca padrão. Dependências numéricas e engines ficam em ambientes separados.

Comandos e resultados estão consolidados em [docs/execution](../docs/execution/README.md). Runs brutos locais ficam em `benchmarks/runs/`, fora do versionamento e incluídos no ZIP de execução. Os relatórios distinguem inferência real, loopback, simulação econômica e carregamento parcial. Nem todos os runs iniciais possuem uma cópia recuperável da versão anterior do harness; o histórico de falhas está preservado e seus limites estão descritos no registro.

Nunca interpretar duas conexões no mesmo computador como dois hosts físicos. Nenhuma execução deste harness libera os gates públicos do planejamento.
