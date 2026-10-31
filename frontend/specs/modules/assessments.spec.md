# AVA — Avaliações

Implementação: `domain/assessment.ts`, `shared/api/demo-clinical.ts`, `modules/assessments/`
Testes: `domain/__tests__/assessment.test.ts`, `shared/api/__tests__/demo-api-rbac.test.ts` (o responsável do plano ABA segue a mesma regra — `specs/modules/aba.spec.md`)
**Somente interface de demonstração (DEMO):** dados em `localStorage`, sem seed clínico.

## Requisitos

- **RF-AVA-001** Abrir avaliação para um paciente com título, finalidade, profissional responsável e lista de etapas.
- **RF-AVA-002** Acompanhar o andamento de cada etapa (pendente, em andamento, concluída).
- **RF-AVA-003** Registrar interpretações (versões sucessivas, com autor e data).
- **RF-AVA-004** Concluir ou cancelar a avaliação; ver histórico completo de eventos.

## Regras

- **RN-AVA-001** Exige paciente do profissional, finalidade (mínimo 5 caracteres) e ao menos uma etapa; nomes de etapa não se repetem. O responsável precisa poder operar a avaliação: profissional **ativo**, com conta de perfil clínico (`clinical:write`) e **vinculado àquele paciente** (RN-PRN-001). Do contrário ninguém poderia concluí-la ou cancelá-la, e a criação é recusada.
- **RN-AVA-002** Transições de etapa: `pendente → em andamento`, `em andamento → pendente | concluída`. Etapa concluída não volta.
- **RN-AVA-003** Interpretação exige `assessments:interpret` (perfil clínico), mínimo de 20 caracteres, e é acrescentada como nova versão; versões anteriores permanecem.
- **RN-AVA-004** Concluir exige todas as etapas concluídas e ao menos uma interpretação. Só o responsável conclui ou cancela.
- **RN-AVA-005** Cancelar exige motivo (mínimo 5 caracteres).
- **RN-AVA-006** Avaliação concluída ou cancelada é somente leitura.
- **RN-AVA-007** Todo evento entra no histórico, que só recebe acréscimos, com autor e data.
- **RN-AVA-008** Acesso segue RN-PRN-001/002; a auditoria não carrega o texto da interpretação, o título nem o nome do paciente (RN-PRN-008).

## Critérios de aceite

- **CA-AVA-001** Dado um perfil sem `assessments:interpret`, quando tenta salvar interpretação, então recebe acesso negado.
- **CA-AVA-002** Dada uma etapa concluída, quando tenta voltá-la a pendente, então a transição é recusada.
- **CA-AVA-003** Dada uma avaliação com etapa pendente, quando o responsável tenta concluir, então é recusado.
- **CA-AVA-004** Dado um profissional que não é o responsável, quando tenta concluir, então recebe acesso negado.
- **CA-AVA-005** Dado um responsável inativo, sem vínculo com o paciente (ou só com atendimento pendente) ou sem conta clínica, quando se abre a avaliação, então é recusado.
