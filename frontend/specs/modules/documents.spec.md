# DOC — Documentos

Implementação: `domain/documents.ts`, `shared/api/documents-api.ts` (HTTP), `shared/api/document-mappers.ts`, `modules/documents/`
Testes: `domain/__tests__/documents.test.ts`, `domain/__tests__/permissions.test.ts`, `shared/api/__tests__/financial-documents-http.test.ts`, `shared/api/__tests__/financial-document-mappers.test.ts`
Dados na API (`/documents`, `/documents/:id/status`, `/documents/:id/releases`), guardados em `api_resources`; só metadados — não há arquivos nem portal do responsável.

## Requisitos

- **RF-DOC-001** Registrar documento do paciente com título, tipo, classificação (clínico, administrativo, financeiro) e estado.
- **RF-DOC-002** Estados: `rascunho → emitido → arquivado`.
- **RF-DOC-003** Liberar documento emitido para responsáveis, de forma explícita, e revogar a liberação.
- **RF-DOC-004** Listar com filtros de paciente, classificação e estado, mostrando só o que o perfil pode ver.
- **RF-DOC-005** Novo documento, editar rascunho e duplicar abrem em dialog sobre a lista, endereçável por `?novo=1` e `?editar=<id>` (convenção em `specs/ui/dialogs.md`, seção "Dialog por rota/query").

## Regras

- **RN-DOC-001** Permissão por classificação. Clínico: `clinical:read`/`clinical:write` com vínculo ao paciente. Administrativo: leitura por `patients:read` (ou `patients:read-own` no próprio paciente), escrita por `patients:write`. Financeiro: leitura `finance:read`, escrita `finance:write`. Listar exige `documents:read`.
- **RN-DOC-002** Documento clínico referencia um registro `documento clínico` do prontuário do mesmo paciente (`clinicalRecordId` = id raiz). O conteúdo clínico não é copiado para este módulo.
- **RN-DOC-003** Só rascunho é editável. Emitir documento clínico exige o registro vinculado `finalizado`. Arquivar é definitivo e revoga liberações ativas.
- **RN-DOC-004** Liberação exige documento `emitido`, responsável vinculado ao paciente com `canReceiveDocuments`, e sem liberação ativa para o mesmo responsável. Quem libera precisa de escrita na classificação.
- **RN-DOC-005** Liberação é explícita e individual (por responsável); nada é liberado por padrão. Revogar exige motivo (mínimo 5 caracteres); liberação e revogação permanecem registradas (autor e data).
- **RN-DOC-006** Retificar o registro clínico vinculado revoga as liberações ativas do documento, que precisa ser liberado de novo.
- **RN-DOC-007** Auditoria registra o fato, sem título do documento, nome do paciente nem conteúdo (RN-PRN-008). Leitura de documento clínico é auditada (RN-PRN-011).
- **RN-DOC-008** Documento clínico só é criado e liberado pelo autor do registro clínico vinculado, que ainda precisa ter escrita clínica no paciente. Outro profissional com acesso ao paciente pode ver, mas não cria nem libera. Revogar continua aberto a quem escreve na classificação.
- **RN-DOC-009** Sem vínculo não há liberação ativa: desvincular o responsável do paciente, trocar o responsável do vínculo ou retirar `canReceiveDocuments` revoga todas as liberações ativas dele nos documentos do paciente, em todas as classificações. As liberações permanecem no histórico (autor e data da liberação; autor, data e motivo da revogação) e as de outros responsáveis e de outros pacientes não são afetadas. A revogação é auditada sem dados do documento. A tela do documento mostra e permite revogar liberação ativa mesmo de quem já não está vinculado.

## Critérios de aceite

- **CA-DOC-001** Dado um documento em rascunho, quando se tenta liberar, então é recusado.
- **CA-DOC-002** Dado um responsável sem `canReceiveDocuments`, quando se tenta liberar, então é recusado.
- **CA-DOC-003** Dado um perfil de recepção, quando lista documentos, então não vê os de classificação clínica nem financeira.
- **CA-DOC-004** Dado um documento arquivado, quando consulto liberações, então nenhuma está ativa.
- **CA-DOC-005** Dado um documento clínico liberado a um responsável, quando ele é desvinculado ou perde `canReceiveDocuments`, então a liberação fica revogada, com o histórico preservado, e não há como liberar de novo sem autorização.
- **CA-DOC-006** Dado um profissional com vínculo ao paciente mas que não é o autor do registro clínico, quando tenta criar ou liberar o documento clínico, então recebe acesso negado.
