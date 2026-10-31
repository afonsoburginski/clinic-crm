# Mapa do repositório

| Serviço/domínio | Responsabilidade | Diretório | Entry point | Dependências principais | Relações |
| --- | --- | --- | --- | --- | --- |
| admin-web | Painel React para autenticação, operação administrativa e módulos clínicos/financeiros, todos sobre a API HTTP | `app/`, `modules/`, `shared/` | Next App Router (`app/`) | Next, React, TanStack Query, Zod, React Hook Form | módulos usam `domain/` e `shared/` |
| domain | Regras puras, tipos e validações | `domain/` | imports diretos | TypeScript | consumido por `shared/` e módulos |
| specs | Requisitos e critérios de aceite | `specs/` | `specs/README.md` | Markdown | fonte de verdade para a implementação |
