# AUTH — Acesso, sessão e RBAC

Implementação: `domain/permissions.ts`, `modules/auth/` · Testes: `domain/__tests__/permissions.test.ts`

## Requisitos

- **RF-AUTH-001** O usuário entra com e-mail e senha em `/entrar` (formulário validado com Zod; na demo, a senha de todas as contas é `clinica123` e há atalhos que preenchem as credenciais).
- **RF-AUTH-002** A sessão persiste entre recarregamentos até o usuário sair.
- **RF-AUTH-003** Rotas internas exigem sessão; sem sessão, redirecionar para `/`.
- **RF-AUTH-004** A navegação exibe apenas itens que o perfil pode acessar.
- **RF-AUTH-005** "Restaurar dados de demonstração" recria o banco local a partir do seed. Só aparece para quem tem `settings:manage` e pede confirmação antes de executar.

## Regras de negócio

- **RN-AUTH-001** Permissões são a união dos papéis do usuário.
- **RN-AUTH-002** Administrador **não** recebe `clinical:read` — gestão administrativa não implica acesso clínico.
- **RN-AUTH-003** Profissional enxerga apenas a própria agenda e os pacientes que atende. "Atende" = atendimento `confirmado`, `em atendimento` ou `concluído`, ou ser o profissional de referência do paciente (RN-PRN-001). Solicitado, pendente, cancelado e falta não vinculam, e profissional inativo não alcança nenhum paciente.
- **RN-AUTH-004** Toda checagem de permissão acontece no adaptador de API; a UI apenas oculta ações.
- **RN-AUTH-005** Após 5 falhas seguidas de login para o mesmo e-mail, o acesso fica bloqueado por 5 minutos (`domain/login-lockout.ts`). Login bem-sucedido zera o contador.
- **RN-AUTH-006** A mensagem de erro não revela se o e-mail existe ("E-mail ou senha incorretos.").
- **RN-AUTH-007** Restaurar os dados de demonstração apaga todos os dados locais (inclusive a auditoria). O adaptador exige `settings:manage` **e** confirmação explícita (`{ confirm: true }`); sem uma das duas, nada é apagado. A restauração fica registrada na auditoria recriada, sem dados pessoais.

## Matriz

| Permissão | Admin | Recepção | Profissional | Financeiro | Gestor |
| --- | :-: | :-: | :-: | :-: | :-: |
| patients:read | x | x | próprios | x | |
| patients:write | x | x | | | |
| appointments:read | x | x | própria | x | x |
| appointments:write | x | x | | | |
| professionals:manage | x | | | | x |
| services/rooms:manage | x | | | | |
| settings:manage (inclui restaurar a demo) | x | | | | |
| audit:read | x | | | | x |
| clinical:read | | | x | | |
| clinical:write | | | x | | |
| assessments:interpret | | | x | | |
| finance:read | x | | | x | |
| finance:write | | | | x | |
| documents:read | x | x | x | x | |

## Critérios de aceite

- **CA-AUTH-001** Dado um usuário `professional + manager`, quando consulto permissões, então ele tem `professionals:manage` e `appointments:read-own`.
- **CA-AUTH-002** Dado um profissional, quando ele acessa um agendamento de outro profissional, então o acesso é negado.
- **CA-AUTH-003** Dado o perfil Financeiro, quando abro o menu, então não vejo Configurações nem Catálogo.
- **CA-AUTH-004** Dadas 5 senhas erradas seguidas, quando tento entrar de novo, então recebo a mensagem de bloqueio com o tempo restante.
- **CA-AUTH-005** Dado um perfil sem `settings:manage`, quando tenta restaurar a demo (mesmo confirmando), então recebe acesso negado e os dados permanecem.
- **CA-AUTH-006** Dado um Administrador, quando restaura sem confirmação explícita, então é recusado; com confirmação, os dados voltam ao seed.
