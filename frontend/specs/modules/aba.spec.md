# ABA — Plano, sessões e medidas

Implementação: `domain/aba.ts`, `shared/api/demo-clinical.ts`, `modules/aba/`
Testes: `domain/__tests__/aba.test.ts`, `shared/api/__tests__/demo-api-rbac.test.ts`
**Somente interface de demonstração (DEMO):** dados em `localStorage`. Nenhuma medida é semeada ou inventada.

## Requisitos

- **RF-ABA-001** Plano por paciente (título, início, revisão, responsável) com estados rascunho, ativo e encerrado.
- **RF-ABA-002** Objetivos do plano, cada um com critério explícito de alcance.
- **RF-ABA-003** Registrar sessão com medidas por objetivo (tentativas e acertos).
- **RF-ABA-004** Ver progresso por objetivo calculado só das medidas registradas.
- **RF-ABA-005** Histórico de alterações do plano e dos objetivos.

## Regras

- **RN-ABA-001** Ativar o plano exige ao menos um objetivo ativo.
- **RN-ABA-002** Todo objetivo tem critério explícito: texto (mínimo 10 caracteres), meta em % (1–100) e número de sessões consecutivas (1–10).
- **RN-ABA-003** Sessão só em plano ativo, em data não futura, com ao menos uma medida; cada medida referencia objetivo ativo do plano, sem repetir objetivo, com tentativas ≥ 1 e `0 ≤ acertos ≤ tentativas`.
- **RN-ABA-004** O progresso vem exclusivamente das medidas registradas e não anuladas. Sem medidas, o percentual é `null` e o estado é "sem dados" — nunca zero nem valor padrão.
- **RN-ABA-005** O critério é atingido quando as últimas N medidas do objetivo (N = sessões consecutivas) são todas ≥ meta.
- **RN-ABA-006** Objetivo só vira `alcançado` se o critério estiver atingido pelas medidas. `Descontinuado` exige motivo. Só objetivo `ativo` muda de situação, e apenas para `alcançado` ou `descontinuado`: o estado terminal é definitivo (não reativa, não troca de terminal, não edita), e o motivo e o histórico permanecem. O motivo informado entra no histórico do plano junto com a mudança.
- **RN-ABA-007** Toda alteração do plano ou objetivos gera entrada no histórico (só acréscimo) com autor, data e campos alterados.
- **RN-ABA-008** Plano encerrado é somente leitura. Sessão registrada não é apagada: pode ser anulada com motivo e deixa de contar no progresso.
- **RN-ABA-009** Acesso segue RN-PRN-001/002; a auditoria não carrega medidas, notas de sessão, títulos nem nome do paciente (RN-PRN-008).
- **RN-ABA-010** Depois de haver medidas registradas e não anuladas para um objetivo, a meta em % e o número de sessões consecutivas não podem ser reduzidos (podem ser mantidos ou aumentados). Sem medidas — ou só com sessões anuladas — ainda podem baixar.
- **RN-ABA-011** O responsável do plano segue RN-AVA-001: profissional ativo, com conta de perfil clínico e vinculado ao paciente; vale ao criar e ao editar o plano.

## Critérios de aceite

- **CA-ABA-001** Dado um objetivo sem medidas, quando o progresso é calculado, então `lastPercent` é `null` e o estado é "sem dados".
- **CA-ABA-002** Dado critério 80% em 3 sessões consecutivas, quando as medidas são 90, 70, 85, 90, então o critério não está atingido (as últimas 3 incluem 70); com 90, 80, 90, 100 está atingido.
- **CA-ABA-003** Dado um objetivo sem critério atingido, quando se tenta marcá-lo alcançado, então é recusado.
- **CA-ABA-004** Dada uma sessão anulada, quando o progresso é recalculado, então ela é ignorada.
- **CA-ABA-005** Dado um objetivo descontinuado ou alcançado, quando se tenta reativá-lo ou mudar para o outro estado terminal, então é recusado e o motivo e o histórico permanecem.
- **CA-ABA-006** Dado um objetivo com medidas registradas, quando se tenta reduzir a meta ou as sessões consecutivas, então é recusado.
