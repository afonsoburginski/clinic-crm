# admin-web

- Aplicação interna para operação administrativa da clínica infantil; nesta entrega, API e portal familiar estão fora de escopo (ver `specs/README.md`).
- Rotas: `app/` (Next App Router); páginas autenticadas em `app/(panel)/`.
- Features: `modules/auth`, `patients`, `scheduling`, `catalog`, `dashboard`, `settings`, `clinical-records`, `assessments`, `aba`, `financial`, `documents`.
- Rotas internas em `app/(panel)/`; prontuários e avaliações/ABA respeitam vínculo clínico, financeiro separa lançamentos/pagamentos e documentos filtram por classificação.
- UI compartilhada: `shared/ui`; adaptadores demo: `shared/api/demo-api.ts` e `shared/api/demo-{clinical,financial,documents}.ts`; regras puras: `domain/`.
- Specs específicas em `specs/modules/`; funcionalidades clínicas/financeiras e documentos são demonstração localStorage, não produção.
- Comandos: `bun run typecheck`, `bun run test`.
