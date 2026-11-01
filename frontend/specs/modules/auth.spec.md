# AUTH — Acesso, sessão e RBAC

Implementação: `domain/permissions.ts`, `shared/api/api.ts` (login, sessão e saída contra a API), `shared/lib/session-store.ts`, `modules/auth/` · Testes: `domain/__tests__/permissions.test.ts`, `shared/api/__tests__/api-http.test.ts`
Gestão de usuários, papéis e a matriz editável: `specs/modules/users-roles.spec.md`.

## Requisitos

- **RF-AUTH-001** O usuário entra com e-mail e senha em `/entrar` (formulário validado com Zod; a autenticação é feita pela API em `POST /auth/login`, sem contas ou atalhos de demonstração).
- **RF-AUTH-002** A sessão persiste entre recarregamentos até o usuário sair.
- **RF-AUTH-003** Rotas internas exigem sessão; sem sessão, redirecionar para `/`.
- **RF-AUTH-004** A navegação exibe apenas itens que o perfil pode acessar.
- **RF-AUTH-005** A sessão guarda o token e o usuário devolvidos pela API (`villiere-session`); no recarregamento o token é revalidado em `GET /auth/session` e, se recusado ou vencido, a sessão local é encerrada. Sair revoga o token no servidor.
- **RF-AUTH-006** Abrir uma URL do painel sem sessão (link direto, F5 com token vencido) leva ao login com o destino em `?next=`; depois de entrar, o usuário volta ao mesmo endereço (inclusive `?novo=1`/`?editar=`). Só caminhos internos são aceitos (`shared/lib/return-to.ts`); sair ou expirar durante o uso vai ao login sem destino.

## Regras de negócio

- **RN-AUTH-001** Permissões são a união dos papéis do usuário, conforme a matriz papel × permissão **salva no banco** (editável em Configurações > Papéis e permissões). A API devolve as permissões efetivas em `user.permissions` (login e `GET /auth/session`) e a UI usa essas; o padrão da tabela abaixo é o ponto de partida de cada clínica e só serve de reserva para uma sessão antiga sem o campo.
- **RN-AUTH-002** (revogada) O Administrador pode **tudo**, sem exceção: tem todas as permissões do catálogo, inclusive `clinical:*`, e passa nas checagens de vínculo com o paciente e de classificação de documentos. A matriz do Administrador é imutável (a API recusa edição com 422) e permissão nova do catálogo entra nele automaticamente. Antes, gestão administrativa não implicava acesso clínico.
- **RN-AUTH-003** Profissional enxerga apenas a própria agenda e os pacientes que atende. "Atende" = atendimento `confirmado`, `em atendimento` ou `concluído`, ou ser o profissional de referência do paciente (RN-PRN-001). Solicitado, pendente, cancelado e falta não vinculam, e profissional inativo não alcança nenhum paciente.
- **RN-AUTH-004** Toda checagem de permissão acontece no servidor (a API responde 403); a UI apenas oculta ações e traduz a recusa em mensagem clara.
- **RN-AUTH-005** Após 5 falhas seguidas de login para o mesmo e-mail, o acesso fica bloqueado por 5 minutos (`domain/login-lockout.ts`). Login bem-sucedido zera o contador.
- **RN-AUTH-006** A mensagem de erro não revela se o e-mail existe ("E-mail ou senha incorretos.").
- **RN-AUTH-007** Não existe dado de demonstração nem armazenamento local de dados de negócio: todos os módulos leem e gravam na API, e o navegador guarda apenas a sessão (token e snapshot do usuário) e preferências de interface.

## Matriz

| Permissão | Admin | Recepção | Profissional | Financeiro | Gestor |
| --- | :-: | :-: | :-: | :-: | :-: |
| patients:read | x | x | próprios | x | |
| patients:write | x | x | | | |
| appointments:read | x | x | própria | x | x |
| appointments:write | x | x | | | |
| professionals:manage | x | | | | x |
| services/rooms:manage | x | | | | |
| settings:manage | x | | | | |
| users:read / users:manage | x | | | | |
| audit:read | x | | | | x |
| clinical:read | x | | x | | |
| clinical:write | x | | x | | |
| assessments:interpret | x | | x | | |
| finance:read | x | | | x | |
| finance:write | x | | | x | |
| finance:export (XLSX do financeiro) | x | | | x | |
| documents:read | x | x | x | x | |

## Critérios de aceite

- **CA-AUTH-001** Dado um usuário `professional + manager`, quando consulto permissões, então ele tem `professionals:manage` e `appointments:read-own`.
- **CA-AUTH-002** Dado um profissional, quando ele acessa um agendamento de outro profissional, então o acesso é negado.
- **CA-AUTH-003** Dado o perfil Financeiro, quando abro o menu, então não vejo Configurações nem Catálogo.
- **CA-AUTH-004** Dadas 5 senhas erradas seguidas, quando tento entrar de novo, então recebo a mensagem de bloqueio com o tempo restante.
- **CA-AUTH-005** Dado um perfil sem `finance:write`, quando a API recusa uma escrita financeira (403), então a tela mostra a mensagem de falta de permissão e nada é alterado.
- **CA-AUTH-006** Dado um token recusado em `GET /auth/session`, quando o painel recarrega, então a sessão local é encerrada e o usuário volta ao login.
- **CA-AUTH-007** Dada uma permissão retirada de um papel na matriz, quando o usuário daquele papel volta a consultar a sessão, então a UI deixa de oferecer a ação e a API passa a responder 403.
