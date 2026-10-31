# Preferências de tabela por usuário

Implementação: `src/domain/table-preferences.ts`, `src/application/{ports/table-preferences.ts,use-cases/table-preferences.ts,auth.ts}`, `src/infrastructure/postgres/{schema.ts,repositories/table-preferences.ts}`, `src/presentation/{composition/table-preferences.ts,routes/table-preferences.ts,routes/auth.ts}`, migration `migrations/007_table_preferences.sql`.
Testes: `test/{table-preferences-domain,table-preferences-use-cases,table-preferences-routes,table-preferences-sql}.test.ts`; `test/table-preferences-repository.test.ts` roda só com `TEST_DATABASE_URL`.

## Requisitos

- **RF-TBL-001** Cada usuário guarda, por tabela (`table_key`), tamanho de página, ordenação, colunas ocultas, ordem das colunas e filtros no PostgreSQL (`user_table_preferences`). Nada fica no navegador.
- **RF-TBL-002** Uma tabela tem N visões nomeadas por usuário. A visão `default` guarda as preferências de trabalho (salvas automaticamente pela UI); as demais são visões salvas explicitamente. No máximo uma visão da tabela é marcada como inicial (`is_default`).
- **RF-TBL-003** `GET /api/v1/preferences/tables/:key` lista as visões do usuário da sessão (`default` primeiro, depois por nome); `PUT /api/v1/preferences/tables/:key/views/:name` cria ou substitui uma visão; `DELETE` remove (remover `default` restaura os padrões).

## Regras de negócio

- **RN-TBL-001** O escopo é sempre o usuário da sessão e a clínica configurada: o usuário nunca vem da URL nem do corpo, então não há como ler ou gravar a preferência de outra pessoa. O guard exige apenas sessão válida (`AUTHENTICATED` em `permissionFor`); métodos e caminhos fora das três rotas continuam negados.
- **RN-TBL-002** `table_key` casa `^[a-z0-9-]{1,60}$`; nome da visão tem 1–40 caracteres, sem caracteres de controle; `default` não pode ser marcada como inicial.
- **RN-TBL-003** Limites: tamanho de página 1–200, até 5 regras de ordenação, 60 colunas, 40 filtros e 16 KiB de JSON por visão; valor de filtro é texto (≤ 200), número, booleano, lista ou objeto plano desses tipos (faixas). O que a tabela não saberia restaurar é recusado (422), nunca gravado.
- **RN-TBL-004** Até 20 visões por usuário e tabela (409 acima disso); marcar uma visão como inicial desmarca as outras na mesma transação, sob lock consultivo por usuário e tabela.
- **RN-TBL-005** Remover visão inexistente responde 404. Apagar o usuário apaga as preferências (FK em cascata); desativar não apaga.

## Critérios de aceite

- **CA-TBL-001** Dado um usuário autenticado sem nenhuma permissão de módulo, quando lista as próprias visões, então recebe 200; sem token, 401.
- **CA-TBL-002** Dado `table_key` inválido, nome vazio ou longo, página 0 ou 500, ordenação com 6 regras ou filtro aninhado, então a resposta é 422 e nada é gravado.
- **CA-TBL-003** Dado o usuário A e o usuário B, quando A salva a visão "Pendentes" de `financial-entries`, então B não a vê.
- **CA-TBL-004** Dada a visão X inicial, quando Y é salva como inicial, então X deixa de ser inicial.
