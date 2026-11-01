# Usuários, papéis e permissões

Implementação: `src/domain/permissions.ts`, `src/application/{auth.ts,ports/users.ts,use-cases/users.ts,use-cases/provisioned-users.ts}`, `src/infrastructure/postgres/{schema.ts,repositories/users.ts}`, `src/presentation/{composition/users.ts,routes/users.ts,routes/auth.ts}`, migration `migrations/006_users_roles_permissions.sql`.
Testes: `test/{permissions-domain,users-use-cases,users-routes,auth-service,users-sql}.test.ts`; `test/users-repository.test.ts` roda só com `TEST_DATABASE_URL`.

## Requisitos

- **RF-USR-001** Usuários da clínica são persistidos no PostgreSQL (`users`, `user_roles`); a autenticação lê deles. Resposta de usuário nunca expõe a senha nem o hash.
- **RF-USR-002** CRUD de usuários: listar, detalhar, criar (nome, e-mail, senha ≥ 8, papéis, profissional vinculado opcional, ativo), alterar (nome, e-mail, vínculo, ativo, papéis) e remover — remover **desativa** (a auditoria aponta para o usuário).
- **RF-USR-003** Atribuição de papéis substitui o conjunto de papéis do usuário (`PUT /users/:id/roles`); redefinição de senha por `POST /users/:id/password`.
- **RF-USR-004** A matriz papel × permissão é persistida por clínica (`role_permissions`) e editável (`PUT /roles/:key/permissions`); `GET /roles` devolve papéis com permissões e contagem de usuários, `GET /permissions` o catálogo agrupado.
- **RF-USR-005** As permissões efetivas da sessão são a união das permissões dos papéis do usuário conforme a matriz do banco; `login` e `GET /auth/session` devolvem `permissions` além de `roles`.
- **RF-USR-006** Toda escrita (criar, alterar, desativar, papéis, senha, matriz) é auditada em `audit_events` com os **nomes** dos campos alterados e nunca valores, senha ou hash.

## Regras de negócio

- **RN-USR-001** Leitura (`/users`, `/roles`, `/permissions`) exige `users:read`; escrita exige `users:manage`. Ambas são concedidas ao `admin` por padrão.
- **RN-USR-002** E-mail é único por clínica, sem diferenciar maiúsculas (índice `users_email_unique` em `lower(email)`); duplicado responde 409 com mensagem pt-BR.
- **RN-USR-003** A clínica sempre mantém ao menos um administrador ativo: o último não pode ser desativado, removido nem perder o papel `admin` (409). A checagem roda sob um lock consultivo por clínica, na mesma transação da escrita, então duas desativações simultâneas não zeram os administradores.
- **RN-USR-004** Desativar o usuário ou redefinir a senha revoga as sessões dele; a checagem de sessão também recusa usuário inativo, mesmo antes da revogação.
- **RN-USR-005** Papéis são os 5 de sistema (`admin`, `reception`, `professional`, `finance`, `manager`); papel customizado não existe. Atribuir papel inexistente é erro de validação.
- **RN-USR-006** O catálogo de permissões e os papéis padrão têm uma única fonte (`domain/permissions.ts`). O catálogo global é semeado pela migration `006`; os papéis e a matriz padrão são semeados por clínica, de forma idempotente, no primeiro uso e **nunca sobrescrevem** uma matriz já editada. A exceção é o `admin`: a migration `009` concede o catálogo inteiro ao papel de cada clínica existente e o seed repete a concessão a cada subida (permissões futuras), sempre com `ON CONFLICT DO NOTHING`.
- **RN-USR-007** O papel `admin` pode tudo, sem exceção (revoga a RN-AUTH-002): quem o tem recebe o catálogo inteiro como permissões efetivas, clínicas incluídas, derivado do catálogo (permissão nova entra sozinha), e o guard HTTP, as policies e os escopos (vínculo paciente-profissional, `*-own`, classificação de documentos, autoria na finalização do prontuário) o deixam passar. Rotas sem permissão mapeada seguem negadas para todos.
- **RN-USR-008** O papel `admin` é imutável: salvar sua matriz com qualquer conjunto que não seja o catálogo inteiro é recusado (422, "O administrador tem acesso total e não pode ser alterado."); o conjunto completo é aceito sem efeito. Permissão fora do catálogo é recusada (422).
- **RN-USR-009** Bootstrap: com `AUTH_USERS_JSON` configurado e a clínica sem usuários, a lista é importada uma única vez (upsert por e-mail, preservando hash e papéis; id que não é UUID recebe um novo). Lista malformada ou com papel desconhecido é ignorada por inteiro. Não é seed de demonstração.
- **RN-USR-010** O cache da matriz é de 15 s por instância e invalidado na hora ao editar na própria instância; alteração de permissão vale na próxima leitura de sessão.

## Critérios de aceite

- **CA-USR-001** Dado um perfil sem `users:read`, quando chama qualquer rota de usuários, papéis ou permissões, então recebe 403 (401 sem token).
- **CA-USR-002** Dado um único administrador ativo, quando tenta desativá-lo, tirar o papel ou removê-lo, então recebe 409 e nada muda.
- **CA-USR-003** Dado um e-mail já usado (qualquer caixa), quando cria ou altera outro usuário para ele, então recebe 409.
- **CA-USR-004** Dada senha com menos de 8 caracteres, quando cria ou redefine, então recebe 422 e nada é gravado.
- **CA-USR-005** Dado o papel `admin`, quando se salva qualquer conjunto menor que o catálogo (por exemplo sem `clinical:write` ou sem `users:manage`), então recebe 422.
- **CA-USR-006** Dado um usuário desativado, quando usa um token emitido antes, então recebe 401.
- **CA-USR-007** Dada uma permissão removida de um papel, quando o usuário volta a consultar a sessão, então a permissão deixa de valer.
- **CA-USR-008** Dado qualquer usuário na resposta da API, então não há `passwordHash` nem a senha.
