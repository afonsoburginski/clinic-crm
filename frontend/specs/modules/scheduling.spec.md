# AGD — Agenda

Implementação: `domain/scheduling.ts`, `domain/appointment-status.ts`, `domain/clinic-time.ts`, `modules/scheduling/`
Testes: `domain/__tests__/scheduling.test.ts`, `domain/__tests__/appointment-status.test.ts`

## Requisitos

- **RF-AGD-001** Visualização por dia e por semana, com colunas por profissional na visão diária.
- **RF-AGD-002** Filtros por profissional e sala; profissional vê apenas a própria agenda.
- **RF-AGD-003** Criar atendimento (paciente, serviço, profissional, sala, início) — término calculado pela duração do serviço.
- **RF-AGD-004** Criar bloqueio de agenda (motivo, profissional, intervalo).
- **RF-AGD-005** Recorrência semanal de 1 a 12 ocorrências.
- **RF-AGD-006** Detalhe do agendamento com ações de status permitidas ao usuário.
- **RF-AGD-007** Reagendar mantendo o histórico na auditoria.

## Regras de negócio

- **RN-AGD-001** Todos os horários são interpretados no fuso da clínica (`America/Sao_Paulo`) e persistidos em ISO UTC.
- **RN-AGD-002** Respeitar horário de funcionamento da clínica e a grade do profissional.
- **RN-AGD-003** Um profissional não pode ter dois compromissos sobrepostos (atendimento ou bloqueio).
- **RN-AGD-004** Indisponibilidades do profissional impedem agendamento no período.
- **RN-AGD-005** Sala exclusiva não pode ser compartilhada no mesmo horário.
- **RN-AGD-006** Antecedência mínima configurável (padrão 60 min).
- **RN-AGD-007** Cancelados e faltas **não** bloqueiam o horário.
- **RN-AGD-008** Em conflito, sugerir o próximo horário livre (passos de 15 min, até 14 dias).
- **RN-AGD-009** Na recorrência, qualquer ocorrência em conflito aborta toda a série.
- **RN-AGD-010** O serviço deve pertencer a uma especialidade do profissional.

## Máquina de estados

```
requested → pending | confirmed | cancelled
pending   → confirmed | cancelled
confirmed → in_progress | no_show | cancelled
in_progress → completed
completed, cancelled, no_show → (terminais)
```

- **RN-AGD-011** Cancelar exige `appointments:cancel` e, se configurado, motivo.
- **RN-AGD-012** Profissional pode apenas iniciar, concluir ou registrar falta nos **próprios** atendimentos.
- **RN-AGD-013** Agendamentos encerrados (concluído, cancelado, falta) não podem ser reagendados.
- **RN-AGD-014** Um agendamento novo só nasce `solicitado`, `pendente` ou `confirmado` (padrão `confirmado`); "em atendimento" e "concluído" só chegam pela máquina de estados. O vínculo clínico só nasce de atendimento confirmado em diante (RN-PRN-001).
- **RN-AGD-015** Reagendar não leva o vínculo clínico junto: trocar o paciente ou o profissional de um atendimento `confirmado` o devolve a `pendente` (exige nova confirmação, registrado no diff da auditoria); em `em atendimento` a troca é recusada. Mudar só o horário preserva o status.

## Critérios de aceite

- **CA-AGD-001** Dado um atendimento confirmado das 10h às 11h, quando tento 10h30–11h30 com o mesmo profissional, então recebo `professional_busy`.
- **CA-AGD-002** Dado um atendimento cancelado das 10h às 11h, quando agendo no mesmo horário, então não há conflito.
- **CA-AGD-003** Dada uma sala exclusiva ocupada, quando outro profissional tenta usá-la no mesmo horário, então recebo `room_busy`.
- **CA-AGD-004** Dado um conflito, quando peço sugestão, então recebo o primeiro intervalo livre a partir do horário desejado.
- **CA-AGD-005** Dado um atendimento concluído, quando consulto transições, então a lista é vazia.
- **CA-AGD-006** Dado um atendimento pendente ou solicitado (criado ou reagendado para outro profissional), quando esse profissional abre o prontuário do paciente, então recebe acesso negado.
- **CA-AGD-007** Dado um atendimento confirmado reatribuído a outro profissional, quando a recepção o reagenda, então volta a `pendente` e o novo profissional só ganha vínculo depois de confirmado.
