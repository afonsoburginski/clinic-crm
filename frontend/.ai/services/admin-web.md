# admin-web

- Aplicação interna para operação administrativa da clínica infantil; o portal familiar está fora de escopo (ver `specs/README.md`).
- Rotas: `app/` (Next App Router); páginas autenticadas em `app/(panel)/`.
- Features: `modules/auth`, `patients`, `scheduling`, `catalog`, `dashboard`, `settings`, `clinical-records`, `assessments`, `aba`, `financial`, `documents`.
- Rotas internas em `app/(panel)/`; prontuários e avaliações/ABA respeitam vínculo clínico, financeiro separa lançamentos/pagamentos e documentos filtram por classificação.
- UI compartilhada: `shared/ui`; adaptadores HTTP: `shared/api/api.ts` e `shared/api/{clinical,financial,documents}-api.ts` (mappers em `*-mappers.ts`); regras puras: `domain/`.
- Specs específicas em `specs/modules/`; nenhum módulo usa dado local: tudo é lido e gravado na API.
- Comandos: `bun run typecheck`, `bun run test`.
