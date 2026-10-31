# PRN — Prontuário

Implementação: `domain/clinical-record.ts`, `shared/api/demo-clinical.ts`, `modules/clinical-records/`
Testes: `domain/__tests__/clinical-record.test.ts`, `domain/__tests__/permissions.test.ts`, `shared/api/__tests__/demo-api-rbac.test.ts`
**Somente interface de demonstração (DEMO):** dados em `localStorage`, sem seed clínico, não registrar dados reais.

## Requisitos

- **RF-PRN-001** Prontuário por paciente com registros de três tipos: anamnese, evolução e documento clínico.
- **RF-PRN-002** Criar registro como rascunho e editá-lo enquanto for rascunho.
- **RF-PRN-003** Finalizar o registro (torna o conteúdo imutável).
- **RF-PRN-004** Retificar registro finalizado: cria nova versão em rascunho, ligada à original, com motivo.
- **RF-PRN-005** Linha do tempo do paciente com filtro por tipo, histórico de eventos e cadeia de versões.
- **RF-PRN-006** Lista de prontuários acessíveis: apenas os pacientes do profissional logado.

## Regras

- **RN-PRN-001** Ler exige `clinical:read` e escrever exige `clinical:write`, ambos somados ao vínculo com o paciente. O vínculo vem de um atendimento `confirmado`, `em atendimento` ou `concluído` com o profissional, ou de ser o profissional de referência do paciente — e **o profissional precisa estar ativo**. Atendimento solicitado, pendente, cancelado ou falta não vincula; bloqueio de agenda também não. Quem não tem vínculo recebe acesso negado (a lista de pacientes vem restrita aos vinculados).
- **RN-PRN-002** Recepção, financeiro, administração e gestão (sem papel profissional) nunca leem nem escrevem prontuário (RN-AUTH-002).
- **RN-PRN-003** Só o autor edita o rascunho e retifica. Autor e data de criação nunca mudam.
- **RN-PRN-004** Finalizar exige título e conteúdo com ao menos 20 caracteres.
- **RN-PRN-005** Registro `finalizado` ou `retificado` é imutável: nenhum campo de conteúdo muda depois.
- **RN-PRN-006** Retificação exige motivo (mínimo 10 caracteres), parte apenas de registro `finalizado` e admite no máximo uma retificação em rascunho por registro.
- **RN-PRN-007** Ao finalizar a retificação, a versão anterior passa a `retificado` (com `supersededById`). Versões, autores e eventos permanecem.
- **RN-PRN-008** Auditoria registra ator, data e tipo da ação, sem nome do paciente nem título ou conteúdo clínico, e nunca grava diff de campos clínicos. Vale para prontuário, avaliações, ABA e documentos, inclusive para registros antigos: a listagem da auditoria devolve só o fato (RN-CFG-003).
- **RN-PRN-009** Evolução vinculada a atendimento exige que o atendimento seja do mesmo paciente e do próprio profissional.
- **RN-PRN-010** Finalizar uma retificação revoga as liberações de documentos ligados ao registro (RN-DOC-006).
- **RN-PRN-011** Leitura clínica permitida (lista, registro, versões; avaliações; planos ABA; documento clínico) gera registro de auditoria `read` com ator, data e identificador opaco — sem nome, título ou conteúdo. A mesma leitura pelo mesmo ator dentro de 60 s conta uma vez. Acesso negado não gera leitura.

## Critérios de aceite

- **CA-PRN-001** Dado um usuário de recepção, quando lista ou lê registros, então recebe acesso negado.
- **CA-PRN-002** Dado um profissional que não atende o paciente, quando abre o prontuário, então recebe acesso negado.
- **CA-PRN-003** Dado um registro finalizado, quando o autor edita o conteúdo, então a operação é recusada.
- **CA-PRN-004** Dado um registro finalizado, quando o autor retifica e finaliza a nova versão, então a original fica `retificado`, com autor e conteúdo intactos, e a nova fica `finalizado`.
- **CA-PRN-005** Dado outro profissional, quando tenta retificar registro alheio, então recebe acesso negado.
- **CA-PRN-006** Dado um atendimento solicitado, pendente, cancelado ou falta, quando o profissional abre o prontuário do paciente, então recebe acesso negado; com atendimento confirmado, em atendimento ou concluído, o acesso é concedido.
- **CA-PRN-007** Dado um profissional inativo, quando abre qualquer prontuário (inclusive de paciente de referência), então recebe acesso negado.
- **CA-PRN-008** Dado um gestor sem acesso clínico, quando consulta a auditoria, então vê o fato de cada ação clínica, inclusive as antigas, sem nome de paciente, título ou conteúdo.
