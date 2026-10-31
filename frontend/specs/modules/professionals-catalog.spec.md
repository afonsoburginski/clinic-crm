# PRO — Profissionais · CAT — Catálogo

Implementação: `modules/professionals/`, `modules/catalog/` · Testes: `domain/__tests__/schemas.test.ts`

## Requisitos — Profissionais

- **RF-PRO-001** Cadastrar profissional com nome, e-mail, telefone, registro (CRP/CRFa) e especialidades.
- **RF-PRO-002** Definir grade semanal com uma ou mais faixas por dia.
- **RF-PRO-003** Registrar e remover indisponibilidades pontuais (férias, congresso, licença).
- **RF-PRO-004** Cada profissional tem uma cor de identificação usada na agenda.

## Regras — Profissionais

- **RN-PRO-001** Ao menos uma especialidade é obrigatória.
- **RN-PRO-002** Faixas do mesmo dia não podem se sobrepor; término deve ser após o início.
- **RN-PRO-003** Profissional inativo não recebe novos agendamentos, mas mantém o histórico.

## Requisitos — Catálogo

- **RF-CAT-001** Especialidades: nome, descrição, ativa.
- **RF-CAT-002** Serviços: nome, especialidade, duração padrão, valor de referência, exige sala, ativo.
- **RF-CAT-003** Salas: nome, capacidade, uso exclusivo, observações, ativa.
- **RF-CAT-004** Criar e editar profissional, serviço e sala abre em dialog sobre a lista (ou sobre a ficha do profissional), endereçável por `?novo=1` e `?editar=<id>` (na ficha do profissional, `?editar=1`) (convenção em `specs/ui/dialogs.md`, seção "Dialog por rota/query"); salvar ou cancelar fecha o dialog sem perder a posição da tela. Especialidades e agenda do profissional seguem editando na própria página.

## Regras — Catálogo

- **RN-CAT-001** Duração de serviço entre 10 e 480 minutos.
- **RN-CAT-002** Valor de referência é armazenado em centavos.
- **RN-CAT-003** Itens são desativados, nunca excluídos, para preservar o histórico.
- **RN-CAT-004** Sala exclusiva não pode ter dois atendimentos simultâneos (ver RN-AGD-005).
