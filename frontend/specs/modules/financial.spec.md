# FIN — Financeiro

Implementação: `domain/financial.ts`, `shared/api/demo-financial.ts`, `modules/financial/`
Testes: `domain/__tests__/financial.test.ts`, `domain/__tests__/schemas.test.ts`, `shared/api/__tests__/demo-api-rbac.test.ts`
**Somente interface de demonstração (DEMO):** dados em `localStorage`, sem seed financeiro.

## Requisitos

- **RF-FIN-001** Lançamentos de receita e despesa com descrição, categoria, competência (AAAA-MM), vencimento e valor.
- **RF-FIN-002** Pagamentos registrados à parte do lançamento, com valor, data e forma.
- **RF-FIN-003** Resumo por competência calculado dos lançamentos e pagamentos reais.
- **RF-FIN-004** Estorno de pagamento e cancelamento de lançamento, ambos com motivo e sem apagar registros.

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
- **RN-FIN-010** Ler exige `finance:read`; escrever (lançar, pagar, estornar, cancelar) exige `finance:write`. Auditoria sem valores.
- **RN-FIN-011** Toda escrita financeira é auditada sem valor monetário (nem em texto, nem em diff). Alterar um lançamento registra a lista de campos alterados (`amountCents`, `dueDate`, `description`, …) com `from`/`to` nulos: o histórico mostra *o que* mudou, nunca *para quanto*.

## Critérios de aceite

- **CA-FIN-001** Dado lançamento de R$ 100, quando pago R$ 40 e depois R$ 60, então fica `pago`; um terceiro pagamento é recusado.
- **CA-FIN-002** Dado lançamento de R$ 100 com R$ 40 pagos, quando se tenta pagar R$ 70, então excede o saldo e é recusado.
- **CA-FIN-003** Dado lançamento com pagamento ativo, quando se tenta cancelar, então é recusado até estornar o pagamento.
- **CA-FIN-004** Dado um perfil Administrador, quando tenta lançar, então recebe acesso negado (só leitura).
- **CA-FIN-005** Dado o valor 0,004 ou 10,005, quando se tenta criar, editar ou pagar, então é recusado e nada é gravado; 19,99 vira 1999 centavos.
- **CA-FIN-006** Dado um lançamento alterado de R$ 100 para R$ 150,50, quando consulto a auditoria, então vejo que `amountCents` mudou, sem nenhum dos dois valores.
