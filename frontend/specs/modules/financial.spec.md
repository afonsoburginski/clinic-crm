# FIN — Financeiro

Implementação: `domain/financial.ts`, `shared/api/financial-api.ts` (HTTP), `shared/api/financial-mappers.ts`, `shared/api/financial-report-mappers.ts`, `modules/financial/` (`lib/{filters,export-rows,export-xlsx,chart-data}.ts`, `components/`), `domain/permissions.ts`; backend: `backend/specs/financial-report.spec.md`
Testes: `domain/__tests__/financial.test.ts`, `domain/__tests__/schemas.test.ts`, `domain/__tests__/permissions.test.ts`, `shared/api/__tests__/financial-documents-http.test.ts`, `shared/api/__tests__/financial-document-mappers.test.ts`, `shared/api/__tests__/financial-report-http.test.ts`, `modules/financial/lib/__tests__/{filters,export-rows,export-xlsx,chart-data}.test.ts`
Dados na API (`/financial/entries`, `/financial/payments/:id/reverse`), guardados em `api_resources` no PostgreSQL; nada fica no navegador.

## Requisitos

- **RF-FIN-001** Lançamentos de receita e despesa com descrição, categoria, competência (AAAA-MM), vencimento e valor.
- **RF-FIN-002** Pagamentos registrados à parte do lançamento, com valor, data e forma.
- **RF-FIN-003** Resumo por competência calculado dos lançamentos e pagamentos reais.
- **RF-FIN-004** Estorno de pagamento e cancelamento de lançamento, ambos com motivo e sem apagar registros.
- **RF-FIN-005** A página `/financeiro` mostra quatro indicadores do período filtrado: **Receita recebida**, **A receber**, **Vencido** e **Ticket médio** (fórmulas em RN-FIN-013), além de despesas pagas e resultado realizado como apoio.
- **RF-FIN-006** Dois gráficos do mesmo filtro: (1) receita × despesa por período (mensal, ou diário quando o intervalo tem até 31 dias) e (2) distribuição por **situação**, com alternância para **forma de pagamento**. Cada gráfico tem tabela equivalente acessível (leitores de tela), tooltip e eixos em pt-BR/BRL.
- **RF-FIN-007** A tabela de lançamentos pagina, ordena e filtra **no servidor** (`GET /financial/entries/search`) com período de vencimento (`DateRangePicker`), tipo, situação, forma de pagamento, categoria, competência, faixa de valor e busca por texto. O mesmo estado de filtros alimenta indicadores, gráficos, tabela e exportação. Visões salvas e preferências de colunas vêm do banco (`tableKey: financial-entries`).
- **RF-FIN-008** **Exportar XLSX** gera a planilha a partir de `GET /financial/export` com os filtros **atuais** (sem paginação) e só aparece para quem tem `finance:export`; o servidor também recusa quem não tem.
- **RF-FIN-009** Cada bloco (indicadores, gráficos, tabela) tem seus estados de carregando (esqueleto), vazio e erro com "Tentar novamente", sem derrubar os demais. Vazio sem filtros oferece "Novo lançamento" a quem tem `finance:write`.
- **RF-FIN-010** Novo lançamento, editar e duplicar abrem em dialog sobre a página, endereçável por `?novo=1` e `?editar=<id>` (o lançamento é buscado pelo id, pois a tabela é paginada no servidor) (convenção em `specs/ui/dialogs.md`, seção "Dialog por rota/query"); os filtros da tela não mudam ao abrir ou fechar.

## Regras

- **RN-FIN-001** Valor em centavos, inteiro e maior que zero. Na entrada em reais, no máximo 2 casas decimais e ao menos R$ 0,01: valor que arredonda a zero (ex.: 0,004) ou tem mais de 2 casas (ex.: 10,005) é recusado, nunca arredondado — na criação, na edição e no pagamento. A regra vale no schema e no domínio (`amountToCents`, `validateEntryAmount`, `validatePayment`, `validateEntryUpdate`). Competência `AAAA-MM`; vencimento é data válida.
- **RN-FIN-002** Situação derivada, nesta ordem de precedência: `cancelado`; `pago` (pagamentos ativos ≥ valor); `vencido` (vencimento passado e saldo > 0, mesmo com pagamento parcial); `parcial` (0 < pagos < valor); `aberto`.
- **RN-FIN-003** **Regra explícita de parcelas:** pagamentos parciais são permitidos. Cada baixa é um registro e não pode exceder o saldo em aberto.
- **RN-FIN-004** Sem dupla baixa: lançamento quitado recusa novo pagamento; a mesma `requestId` não gera segundo pagamento.
- **RN-FIN-005** Data de pagamento não pode ser futura. Lançamento cancelado não recebe pagamento.
- **RN-FIN-006** Cancelamento exige motivo (mínimo 5 caracteres), só sem pagamentos ativos, e preserva o lançamento marcado como cancelado. Não há exclusão.
- **RN-FIN-007** Estorno exige motivo, ocorre uma única vez por pagamento e preserva o pagamento marcado como estornado (deixa de contar no saldo).
- **RN-FIN-008** Alterar o valor não pode deixá-lo abaixo do total já pago; o tipo (receita/despesa) não muda.
- **RN-FIN-009** Sem dado clínico: lançamento só referencia paciente por id (opcional); não há campo clínico e a descrição é limitada a 120 caracteres. O módulo nunca lê coleções clínicas.
- **RN-FIN-010** Ler exige `finance:read`; escrever (lançar, pagar, estornar, cancelar) exige `finance:write`; a API recusa com 403. Auditoria sem valores.
- **RN-FIN-012** Formato da API: o tipo do lançamento é enviado como `type` (e `kind`), sem código sequencial — o código de exibição é `LAN-` + 6 primeiros caracteres do id (a API deriva o mesmo código na busca); no detalhe, a situação e o saldo são derivados no cliente dos pagamentos ativos; na lista, a API devolve `situation`, `paidCents` e `balanceCents` já derivados (mesma regra de RN-FIN-002, com "hoje" no fuso da clínica).
- **RN-FIN-013** Indicadores (centavos), sobre os lançamentos que casam com os filtros e não estão cancelados: *receita recebida* = pagamentos ativos das receitas; *a receber* = saldo das receitas abertas ou parciais ainda não vencidas; *vencido* = saldo das receitas vencidas (inclusive de quem pagou parte); *despesas* = pagamentos ativos das despesas; *resultado* = receita recebida − despesas; *ticket médio* = receita recebida ÷ nº de receitas com ao menos um pagamento ativo (0 sem nenhuma). Detalhe e testes no spec do backend (`RN-FRP-002`).
- **RN-FIN-014** A exportação exige `finance:export` (padrão de Administrador e Financeiro; editável na matriz de papéis) e `finance:read`. Recusa mais de 10 000 lançamentos (mensagem pedindo para refinar o filtro) e é auditada com a contagem, sem valores, descrições nem filtros (`RN-FRP-008`).
- **RN-FIN-015** Planilha: aba **Lançamentos** com Código, Tipo, Descrição, Categoria, Contraparte, Competência, Vencimento (data real, `dd/mm/aaaa`), Valor, Pago e Saldo (número formatado `R$ #.##0,00`), Situação (rótulo pt-BR), Paciente e Criado em; cabeçalho em negrito, filtro automático e linha congelada; totais de receitas e de despesas em linhas separadas, com fórmulas `SUMIFS` (somar receita com despesa misturaria os sinais; cancelados ficam de fora) e uma linha de resultado (receitas − despesas) — a aba **Resumo** traz os indicadores e os filtros aplicados em texto. O nome do arquivo é `financeiro-AAAA-MM-DD.xlsx` (data no fuso da clínica). O nome do paciente é resolvido no cliente quando o perfil lê pacientes; sem acesso, a coluna mostra "—". Valores vêm da API em centavos e viram reais só na planilha.
- **RN-FIN-016** Sem estado local de negócio: filtros, colunas e visões vivem na API/PostgreSQL; a exportação não guarda nada no navegador além do arquivo baixado. O `exceljs` é carregado por import dinâmico só no clique.
- **RN-FIN-011** Toda escrita financeira é auditada sem valor monetário (nem em texto, nem em diff). Alterar um lançamento registra a lista de campos alterados (`amountCents`, `dueDate`, `description`, …) com `from`/`to` nulos: o histórico mostra *o que* mudou, nunca *para quanto*.

## Critérios de aceite

- **CA-FIN-001** Dado lançamento de R$ 100, quando pago R$ 40 e depois R$ 60, então fica `pago`; um terceiro pagamento é recusado.
- **CA-FIN-002** Dado lançamento de R$ 100 com R$ 40 pagos, quando se tenta pagar R$ 70, então excede o saldo e é recusado.
- **CA-FIN-003** Dado lançamento com pagamento ativo, quando se tenta cancelar, então é recusado até estornar o pagamento.
- **CA-FIN-004** Dado um perfil Administrador, quando tenta lançar, então recebe acesso negado (só leitura).
- **CA-FIN-005** Dado o valor 0,004 ou 10,005, quando se tenta criar, editar ou pagar, então é recusado e nada é gravado; 19,99 vira 1999 centavos.
- **CA-FIN-006** Dado um lançamento alterado de R$ 100 para R$ 150,50, quando consulto a auditoria, então vejo que `amountCents` mudou, sem nenhum dos dois valores.
- **CA-FIN-007** Dado um perfil com `finance:read` e sem `finance:export`, quando abro `/financeiro`, então vejo indicadores, gráficos e tabela, mas não o botão "Exportar XLSX"; mesmo chamando a API direto, a exportação é recusada com 403.
- **CA-FIN-008** Dado o filtro de vencimento "Este mês" e situação "Vencido", quando exporto, então a planilha tem exatamente as linhas que a tabela mostra nesse filtro (todas as páginas), com Valor/Pago/Saldo numéricos e Vencimento como data.
- **CA-FIN-009** Dada uma falha da API nos indicadores, quando a página carrega, então só o bloco de indicadores mostra o erro com "Tentar novamente"; gráficos e tabela seguem funcionando.
- **CA-FIN-010** Dado qualquer mutação financeira (novo lançamento, pagamento, estorno, cancelamento), quando conclui, então indicadores, gráficos, tabela e detalhe são recarregados.
- **CA-FIN-011** Dado um intervalo de 31 dias ou menos, quando vejo o gráfico de receita × despesa, então ele é diário; acima disso, mensal.
