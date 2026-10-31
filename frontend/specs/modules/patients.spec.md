# PAC — Pacientes · RSP — Responsáveis

Implementação: `domain/schemas.ts`, `domain/duplicate-detection.ts`, `modules/patients/`, `modules/guardians/`
Testes: `domain/__tests__/schemas.test.ts`, `domain/__tests__/duplicate-detection.test.ts`

## Requisitos — Pacientes

- **RF-PAC-001** Listar pacientes com busca por nome, nome social, código ou CPF, e filtro por situação.
- **RF-PAC-002** Cadastrar e editar paciente (dados pessoais, contato, consentimentos, observações administrativas).
- **RF-PAC-003** Ficha do paciente com abas: Dados, Responsáveis e Agendamentos.
- **RF-PAC-004** Código sequencial `PAC-0001` gerado automaticamente.

## Regras — Pacientes

- **RN-PAC-001** Nome completo com no mínimo 3 caracteres; data de nascimento não pode ser futura.
- **RN-PAC-002** CPF é opcional, mas se informado deve ter dígitos verificadores válidos e ser único.
- **RN-PAC-003** Antes de salvar, sugerir possíveis duplicados (CPF igual, ou nome semelhante + mesma data de nascimento). O usuário pode prosseguir conscientemente.
- **RN-PAC-004** Paciente inativo ou arquivado não pode receber novos agendamentos.
- **RN-PAC-005** Alterações geram registro de auditoria com o diff dos campos.

## Requisitos — Responsáveis

- **RF-RSP-001** Cadastro de responsáveis independente do paciente (um responsável pode ter vários pacientes).
- **RF-RSP-002** Vincular responsável ao paciente com parentesco e flags: responsável legal, pode agendar, recebe documentos, contato principal.

## Regras — Responsáveis

- **RN-RSP-001** Telefone é obrigatório para responsável.
- **RN-RSP-002** Um paciente tem no máximo um contato principal; marcar outro desmarca o anterior.
- **RN-RSP-003** O mesmo responsável não pode ser vinculado duas vezes ao mesmo paciente.
- **RN-RSP-004** Desvincular o responsável, trocar o responsável do vínculo ou retirar "recebe documentos" revoga as liberações de documentos ativas dele nesse paciente, mantendo o histórico (RN-DOC-009).

## Critérios de aceite

- **CA-PAC-001** Dado o CPF `111.111.111-11`, quando valido, então é rejeitado.
- **CA-PAC-002** Dado "Maria Aparecida Souza" já cadastrada, quando digito "maria aparecida sousa" com a mesma data de nascimento, então ela aparece como possível duplicado.
- **CA-RSP-001** Dado um paciente com contato principal A, quando marco B como principal, então A deixa de ser principal.
