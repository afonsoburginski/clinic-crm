# Relatório, busca e exportação financeira

Implementação: `src/domain/financial-report.ts`, `src/application/{ports/financial-report.ts,use-cases/financial-report.ts,auth.ts}`, `src/infrastructure/postgres/repositories/financial-report.ts` (Drizzle), `src/presentation/{composition/financial-report.ts,routes/financial-report.ts,routes/api.ts}`, `src/domain/permissions.ts`, migration `migrations/008_finance_export.sql`.
Testes: `test/{financial-report-domain,financial-report-use-cases,financial-report-routes,financial-report-sql}.test.ts`; `test/financial-report-repository.test.ts` roda só com `TEST_DATABASE_URL`.
Complementa `frontend/specs/modules/financial.spec.md` (regras de lançamento, pagamento e estorno ficam em `src/domain/financial.ts`; este spec só lê).

## Requisitos

- **RF-FRP-001** `GET /api/v1/financial/report` devolve, para os lançamentos que casam com os filtros: `indicators`, `series` (receita × despesa por período), `bySituation`, `byMethod` e `facets` (categorias e competências disponíveis para filtrar). Exige `finance:read`.
- **RF-FRP-002** `GET /api/v1/financial/entries/search` devolve `{ items, total, page, pageSize }` com paginação e ordenação no servidor; cada item traz a situação e o saldo derivados (`situation`, `paidCents`, `balanceCents`) e as formas de pagamento ativas (`methods`, sem repetição), sem os pagamentos. Exige `finance:read`.
- **RF-FRP-003** `GET /api/v1/financial/export` devolve `{ items, total }` com todas as linhas filtradas (mesmo formato dos itens da busca, por vencimento e código) para o cliente montar a planilha. Exige `finance:export` **e** `finance:read` (o use case confere as duas, além do guard) e registra a exportação na auditoria.
- **RF-FRP-004** Os três endpoints aceitam os mesmos filtros: `from`/`to` (vencimento, inclusivo, `AAAA-MM-DD`), `kind` (`income`|`expense`|`all`), `status` (situação derivada, lista), `competence` (`AAAA-MM`), `q` (texto), `method` (forma de pagamento, lista), `category` (lista, parâmetro repetido), `minCents`/`maxCents` (valor do lançamento, centavos inteiros). Listas aceitam parâmetro repetido (`status=open&status=paid`) e, exceto `category`, também separado por vírgula.
- **RF-FRP-005** A busca aceita `page` (≥ 1, padrão 1), `pageSize` (1–200, padrão 20), `sort` (`dueDate`, `amount`, `paid`, `balance`, `situation`, `description`, `kind`, `category`, `competence`, `createdAt`, `code`; padrão `dueDate`) e `dir` (`asc`|`desc`).

## Regras de negócio

- **RN-FRP-001** Situação derivada de `financialStatus` (RN-FIN-002): `cancelado`, `pago`, `vencido` (vencimento antes de hoje com saldo, mesmo com pagamento parcial), `parcial`, `aberto`. "Hoje" é a data civil de `America/Sao_Paulo` (`clinicToday`), com `now()` injetável nos testes.
- **RN-FRP-002** Indicadores (centavos), sobre os lançamentos filtrados e nunca cancelados:
  - `receivedCents` (receita recebida) = soma dos pagamentos ativos (não estornados) dos lançamentos de **receita**;
  - `receivableCents` (a receber) = saldo dos lançamentos de receita `aberto` ou `parcial` (ainda não vencidos);
  - `overdueCents` (vencido) = saldo dos lançamentos de receita `vencido`, inclusive o saldo de quem já pagou parte;
  - `expensesCents` = soma dos pagamentos ativos dos lançamentos de **despesa**;
  - `resultCents` = `receivedCents − expensesCents` (o que foi efetivamente baixado);
  - `averageTicketCents` = `receivedCents` ÷ nº de lançamentos de receita com pagamento ativo (pagos ou parcialmente pagos), arredondado; `0` sem nenhum;
  - `entryCount` = nº de lançamentos que casam com os filtros (inclui cancelados).
- **RN-FRP-003** Série: agrupada pelo **vencimento**; diária (`AAAA-MM-DD`) quando `from` e `to` existem e o intervalo tem no máximo 31 dias, mensal (`AAAA-MM`) caso contrário. Com `from` e `to`, os períodos sem lançamento aparecem zerados (até 400 períodos). Cada ponto traz `incomeCents`/`expenseCents` (valor dos lançamentos, previsto) e `incomeSettledCents`/`expenseSettledCents` (pagamentos ativos). Cancelados não entram.
- **RN-FRP-004** `bySituation` lista as cinco situações em ordem fixa (`open`, `partial`, `paid`, `overdue`, `cancelled`) com `count` e `amountCents` (valor do lançamento), inclusive as zeradas. `byMethod` soma os pagamentos ativos por forma de pagamento (`incomeCents` e `expenseCents` separados), do maior para o menor.
- **RN-FRP-005** Filtros: `status` casa a situação **derivada**; `method` casa quem tem ao menos um pagamento ativo na forma; `category` é igualdade exata; `q` procura (sem diferenciar maiúsculas) em código (`LAN-` + 6 primeiros caracteres do id), descrição, categoria e contraparte. As `facets` são calculadas sem o filtro que alimentam (categorias sem `category`, competências sem `competence`).
- **RN-FRP-006** O banco só recebe os filtros baratos (clínica, tipo, vencimento, competência, faixa de valor e texto ASCII); `applyFilters` (domínio) repete todos, então o resultado nunca depende do SQL. Os campos do `payload` são lidos como o domínio lê (`type` com `kind` de reserva; valor malformado vale 0). Nenhum nome de campo JSON vai como parâmetro (`jsonb -> $n` é ambíguo no PostgreSQL).
- **RN-FRP-007** Tetos: uma leitura nunca traz mais de 50 000 lançamentos e a exportação recusa mais de 10 000 (422, "Refine o período ou os filtros."). Parâmetro inválido é 422 com mensagem em pt-BR; nada é lido nem auditado.
- **RN-FRP-008** A exportação grava um evento em `audit_events` (`action = export`, `resource = financial-entry`, `resource_id = export`, `changes` nulo) com o resumo "Exportou N lançamentos". Sem valores, descrições, filtros ou nomes. A auditoria é gravada **antes** de devolver as linhas; se falhar, nada é entregue. Exportação recusada (403/422) não audita.
- **RN-FRP-009** `finance:export` está no catálogo único (`domain/permissions.ts`) e é padrão de `admin` e `finance`. A migration `008` cadastra a permissão e a concede a esses dois papéis nas clínicas que já tinham a matriz semeada (a matriz editada de uma clínica nunca é sobrescrita pelo seed). `permissionFor` mapeia `GET /financial/export` para `finance:export` e recusa outros métodos.
- **RN-FRP-010** `/financial/entries/search` é registrada antes de `/financial/entries/:id` (em `routes/api.ts`); do contrário `search` seria lido como id.

## Critérios de aceite

- **CA-FRP-001** Dado um perfil sem permissões financeiras, quando chama qualquer um dos três endpoints, então recebe 403; sem token, 401.
- **CA-FRP-002** Dado `finance:read` sem `finance:export`, quando exporta, então recebe 403 e nada é auditado; relatório e busca respondem 200.
- **CA-FRP-003** Dados um lançamento de receita de R$ 60 vencido com R$ 10 pagos e um de R$ 200 não vencido com R$ 50 pagos, quando consulto o relatório, então recebido = R$ 60, a receber = R$ 150 e vencido = R$ 50.
- **CA-FRP-004** Dado um intervalo de 31 dias ou menos, quando consulto o relatório, então a série é diária e os dias sem lançamento aparecem zerados.
- **CA-FRP-005** Dados 45 lançamentos e `pageSize=20&page=3`, quando busco, então recebo 5 itens e `total = 45`; ordenar por valor decrescente repete a mesma ordem estável em todas as páginas.
- **CA-FRP-006** Dado um filtro `from` posterior a `to`, ou `pageSize=500`, ou `minCents=-5`, então a resposta é 422 com mensagem em pt-BR.
- **CA-FRP-007** Dada uma exportação de 12 lançamentos por quem tem `finance:export`, quando consulto a auditoria, então vejo um evento "Exportou 12 lançamentos" sem nenhum valor.
- **CA-FRP-008** Dados mais de 10 000 lançamentos filtrados, quando exporto, então recebo 422 e nenhuma auditoria.
