# PAC — Pacientes · RSP — Responsáveis

Implementação: `domain/schemas.ts`, `domain/duplicate-detection.ts`, `modules/patients/` (`patient-form-dialog.tsx`, `patient-form.tsx`), `shared/lib/{url-dialog,use-url-dialog}.ts`, `shared/ui/molecules/form-dialog.tsx`, `modules/guardians/`
Testes: `domain/__tests__/schemas.test.ts`, `domain/__tests__/duplicate-detection.test.ts`, `shared/lib/__tests__/url-dialog.test.ts`, `shared/ui/__tests__/edit-dialog-contract.test.ts`

## Requisitos — Pacientes

- **RF-PAC-001** Listar pacientes com busca por nome, nome social, código ou CPF, e filtro por situação.
- **RF-PAC-002** Cadastrar e editar paciente (dados pessoais, contato, consentimentos, observações administrativas).
- **RF-PAC-003** Ficha do paciente com abas: Dados, Responsáveis e Agendamentos.
- **RF-PAC-004** Código sequencial `PAC-0001` gerado automaticamente.
- **RF-PAC-005** Cadastrar e editar paciente abre um **dialog grande (`xl`) por cima da lista ou da ficha**, com o mesmo `PatientForm`: cabeçalho, abas e contexto da tela continuam visíveis e nada de layout muda. O dialog é endereçável: `/pacientes?novo=1` (cadastro), `/pacientes?editar=<id>` (edição pela lista) e `/pacientes/<id>?editar=1` (edição pela ficha) (convenção em `specs/ui/dialogs.md`, seção "Dialog por rota/query").
- **RF-PAC-006** As rotas antigas `/pacientes/novo` e `/pacientes/<id>/editar` só redirecionam (servidor) para a página pai com a query acima; links e favoritos antigos continuam valendo.

## Regras — Pacientes

- **RN-PAC-001** Nome completo com no mínimo 3 caracteres; data de nascimento não pode ser futura.
- **RN-PAC-002** CPF é opcional, mas se informado deve ter dígitos verificadores válidos e ser único.
- **RN-PAC-003** Antes de salvar, sugerir possíveis duplicados (CPF igual, ou nome semelhante + mesma data de nascimento). O usuário pode prosseguir conscientemente.
- **RN-PAC-004** Paciente inativo ou arquivado não pode receber novos agendamentos.
- **RN-PAC-005** Alterações geram registro de auditoria com o diff dos campos.
- **RN-PAC-006** Salvar fecha o dialog, atualiza a lista/ficha (invalida as queries de pacientes) e mantém a rolagem e a aba ativa; cancelar fecha sem salvar. Com alterações não salvas, fechar (Esc, clique fora, X ou Cancelar) pede confirmação de descarte. Erros da API aparecem no formulário sem fechar o dialog.
- **RN-PAC-007** `?novo=1`/`?editar=` só abrem o dialog para quem tem `patients:write`; sem permissão (ou com `?editar=<id>` de um paciente que a lista não tem) o parâmetro é removido e um aviso é mostrado. Sem sessão, o login devolve ao mesmo endereço.

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
- **CA-PAC-003** Dada a ficha `/pacientes/p1` na aba "Responsáveis", quando clico em Editar, então o dialog abre sobre a ficha com a aba intacta; ao salvar, a ficha mostra os dados novos na mesma aba e no mesmo ponto de rolagem.
- **CA-PAC-004** Dada a URL `/pacientes/p1?editar=1` (link direto ou F5), então a ficha carrega com o dialog de edição já aberto; `/pacientes/p1/editar` redireciona para ela.
- **CA-PAC-005** Dado o dialog com alterações não salvas, quando pressiono Esc, então aparece "Descartar alterações?" e o dialog só fecha se eu confirmar.
- **CA-RSP-001** Dado um paciente com contato principal A, quando marco B como principal, então A deixa de ser principal.
