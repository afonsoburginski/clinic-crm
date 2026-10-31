# Specs — Spec-Driven Development

Toda funcionalidade nasce aqui. A ordem é sempre:

1. **Spec** — escrever/atualizar `specs/modules/<modulo>.spec.md` com requisitos (RF), regras de negócio (RN) e critérios de aceite (CA) em formato _Dado / Quando / Então_.
2. **Domínio** — implementar as regras puras em `domain/` e cobri-las com testes em `domain/__tests__/` referenciando o ID da regra (`RN-AGD-003`).
3. **Contrato** — expor a operação em `shared/api/demo-api.ts` (mesma assinatura que a futura API Hono).
4. **Módulo** — construir a UI em `modules/<modulo>/` usando apenas `shared/ui` e os hooks do próprio módulo.

Nenhum código de regra de negócio vive em componente. Se a regra não está na spec, ela não existe.

## Estrutura

```
specs/                 fonte de verdade (este diretório)
domain/                regras puras, sem React — testadas com Vitest
shared/
  api/                 adaptador de dados (demo em localStorage → futura API HTTP)
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
| `PRN` | Prontuário |
| `AVA` | Avaliações |
| `ABA` | Plano ABA, sessões e medidas |
| `FIN` | Financeiro |
| `DOC` | Documentos |

Os módulos PRN, AVA, ABA, FIN e DOC são **interface de demonstração (DEMO)**: dados em `localStorage`, sem seed clínico/financeiro e sem dado real. Os adaptadores deles ficam em `shared/api/demo-*.ts` (helpers comuns em `demo-context.ts`) e são compostos em `demo-api.ts`.

## Fora do escopo desta entrega

Fase 6 (hardening e produção), API Hono e portal SvelteKit. O adaptador demo mantém o contrato para a troca futura.
