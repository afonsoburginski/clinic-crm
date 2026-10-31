# Specs — Spec-Driven Development

Toda funcionalidade nasce aqui. A ordem é sempre:

1. **Spec** — escrever/atualizar `specs/modules/<modulo>.spec.md` com requisitos (RF), regras de negócio (RN) e critérios de aceite (CA) em formato _Dado / Quando / Então_.
2. **Domínio** — implementar as regras puras em `domain/` e cobri-las com testes em `domain/__tests__/` referenciando o ID da regra (`RN-AGD-003`).
3. **Contrato** — expor a operação em `shared/api/api.ts` (ou `clinical-api.ts`, `financial-api.ts`, `documents-api.ts`) contra a API Hono, com a tradução de formato em `*-mappers.ts`.
4. **Módulo** — construir a UI em `modules/<modulo>/` usando apenas `shared/ui` e os hooks do próprio módulo.

Nenhum código de regra de negócio vive em componente. Se a regra não está na spec, ela não existe.

## Estrutura

```
specs/                 fonte de verdade (este diretório)
domain/                regras puras, sem React — testadas com Vitest
shared/
  api/                 adaptadores HTTP da API Hono (sem dados locais) e mappers de formato
  lib/                 utilitários sem estado (formatação, query client)
  ui/
    atoms/             peças indivisíveis (badge de status, ponto de cor, marca)
    molecules/         combinações simples (campo de formulário, cabeçalho de página, estado vazio)
    organisms/         blocos com comportamento (sidebar, topbar, tabela de dados)
    templates/         esqueletos de página (shell autenticado, layout de login)
modules/<modulo>/
  api.ts               hooks TanStack Query do módulo (queries + mutations)
  components/          componentes específicos do módulo
  index.ts             API pública do módulo — outros módulos só importam daqui
app/                   rotas finas: compõem templates + componentes de módulo
```

### Regras de dependência

- `domain` não importa nada do projeto.
- `shared` importa apenas `domain`.
- `modules/x` importa `domain`, `shared` e o `index.ts` de outros módulos (nunca arquivos internos).
- `app` importa `modules` e `shared/ui/templates`.

## Convenção de IDs

| Prefixo | Módulo |
| --- | --- |
| `AUTH` | Acesso, sessão e RBAC |
| `PAC` | Pacientes |
| `RSP` | Responsáveis |
| `PRO` | Profissionais |
| `CAT` | Especialidades, serviços e salas |
| `AGD` | Agenda |
| `DSH` | Painel |
| `CFG` | Configurações e auditoria |
| `USR` | Usuários, papéis e permissões |
| `PRN` | Prontuário |
| `AVA` | Avaliações |
| `ABA` | Plano ABA, sessões e medidas |
| `FIN` | Financeiro |
| `DOC` | Documentos |

Todos os módulos usam **apenas a API real**: não há dado de demonstração, seed nem armazenamento de dados de negócio no navegador. Os adaptadores ficam em `shared/api/` (`api.ts` compõe `clinical-api.ts`, `financial-api.ts` e `documents-api.ts`; utilitários comuns em `helpers.ts`).

## UI compartilhada

Convenção de dialogs, alertdialogs e sheets (tamanhos, anatomia Header/Body/Footer e escala de z-index): [`ui/dialogs.md`](ui/dialogs.md).

Tabelas de dados e seletor de período (`DataTable` único com filtros, paginação client/server, visões salvas por usuário no PostgreSQL e `DateRangePicker`): [`ui/data-table.md`](ui/data-table.md).

## Fora do escopo desta entrega

Fase 6 (hardening e produção) e portal SvelteKit.
