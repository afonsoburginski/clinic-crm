# DSH — Painel · CFG — Configurações e auditoria

Implementação: `modules/dashboard/`, `modules/settings/`, `modules/audit/`

## Painel

- **RF-DSH-001** Resumo do dia: atendimentos, confirmados, aguardando confirmação, em atendimento, concluídos.
- **RF-DSH-002** Próximos atendimentos (até 7) com acesso rápido ao detalhe.
- **RF-DSH-003** Ocupação semanal por profissional (minutos agendados ÷ minutos da grade).
- **RF-DSH-004** Semana: cancelamentos, faltas e pendências.
- **RN-DSH-001** O painel respeita o escopo do usuário — profissional vê apenas os próprios números.

## Configurações

- **RF-CFG-001** Dados da clínica: nome, razão social, CNPJ, contato, endereço.
- **RF-CFG-002** Horário de funcionamento por dia da semana (aberto/fechado, abertura, fechamento).
- **RF-CFG-003** Políticas: antecedência mínima, tolerância de atraso, janela de reagendamento, motivo obrigatório no cancelamento.
- **RN-CFG-001** Apenas `settings:manage` pode alterar.

## Auditoria

- **RF-CFG-004** Linha do tempo de ações com autor, recurso, resumo e diff dos campos alterados.
- **RF-CFG-005** Filtro por recurso e por autor.
- **RN-CFG-002** O registro de auditoria é somente leitura.
- **RN-CFG-003** Entradas de prontuário, avaliação, ABA e documento (`clinical_record`, `assessment`, `aba_plan`, `aba_session`, `document`, `document_release`) nunca expõem nome de paciente, título nem conteúdo: a listagem devolve, para qualquer perfil com `audit:read` (inclusive gestor sem acesso clínico), apenas ator, data, ação, recurso e identificador opaco, com um resumo padronizado ("Alterou registro de prontuário") e sem diff — mesmo para entradas antigas gravadas com mais detalhe. O dado guardado não é reescrito; a redação é feita na leitura, e a escrita nunca grava `changes` desses recursos.
- **RN-CFG-004** Leituras clínicas permitidas são auditadas como `read` (RN-PRN-011). Restaurar a demo é registrado como `reset` (RN-AUTH-007).
