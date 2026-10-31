# UI — DataTable e DateRangePicker

Implementação: `shared/ui/data-table/` (`data-table.tsx`, `data-table-{toolbar,pagination,columns-menu,views}.tsx`, `filters/filter-controls.tsx`, `columns.tsx`, `preferences.ts`, `lib/*.ts`), `shared/ui/date-range-picker/`, `shared/api/table-preferences-{api,mappers}.ts`.
Backend: `backend/specs/table-preferences.spec.md` (visões e preferências por usuário no PostgreSQL).
Testes: `shared/ui/data-table/lib/__tests__/*.test.ts` (filtros, faixa, paginação, moeda, visões), `shared/ui/date-range-picker/lib/__tests__/range.test.ts` (presets, intervalo, fuso), `shared/ui/data-table/__tests__/data-table-contract.test.ts` (varre `modules/` atrás de `tableKey` válido/único) e `column-actions.test.ts` (menu do cabeçalho), `shared/api/__tests__/table-preferences-http.test.ts`. Sem navegador.

Toda lista de registros do app usa **um** componente, `DataTable` (`@tanstack/react-table` v8), dentro de um `SectionCard bodyClassName="p-0"`. Não há `<Table>` montada à mão nas telas (a matriz papel × permissão é a única exceção: não é lista de registros).

## Anatomia

| Faixa | Conteúdo |
| --- | --- |
| Toolbar | Busca global (debounce de 250 ms, sem acento), filtros declarativos das colunas, à direita as ações da tela (`toolbarActions`), **Colunas** e **Visões**. |
| Chips | Um chip por filtro ativo (remover individual) e "Limpar tudo". |
| Corpo | Tabela semântica (`aria-sort`, cabeçalho em botão). Estados: carregando (esqueleto), erro (com "Tentar novamente"), vazio (`empty`) e "Nenhum resultado" (com "Limpar filtros"). |
| Rodapé | `role="status"` "Mostrando X–Y de Z", linhas por página (10/20/50/100), primeira/anterior/próxima/última e "Ir para N de M". |

## Colunas e metadados

`columns` são `ColumnDef` do TanStack (memoize com `useMemo`). Cada coluna precisa de `id` (ou `accessorKey` simples) e usa `meta` (`shared/ui/data-table/column-meta.ts`):

- `label` (menu de colunas e chips), `align`, `hideBelow` (`sm|md|lg|xl`, no lugar de `hidden md:table-cell`), `alwaysVisible`, `className`;
- `filter`: filtro declarativo (abaixo); `searchValue`: texto da coluna na busca global (sem ele vale o valor do acessor quando for texto/número);
- `exportValue`: valor da coluna para exportar listas em modo cliente (`onRowsChange`). O XLSX do Financeiro não usa este campo: ele sai das linhas da API já filtradas (`GET /financial/export`, RN-FIN-015).

Ações da linha e do cabeçalho: `rowActions` (coluna final "⋯" fixa à direita + clique direito na linha, mesma lista) e o menu de cada cabeçalho de coluna (ordenar, filtrar, ocultar, mostrar todas), ambos descritos em [`context-menu.md`](context-menu.md). `actionsColumn(render)` (`columns.tsx`) segue disponível para botões avulsos.

## Filtros

| `kind` | Controle | Valor em `state.filters[id]` |
| --- | --- | --- |
| `select` | Seleção única com "todos" | `string` |
| `multiselect` | Popover com caixas e contagem por opção | `string[]` (qualquer uma serve) |
| `status` | Pílulas sempre visíveis, com contagem | `string[]` |
| `range` | Mínimo–máximo numérico (`unit`) | `{ min?, max? }` |
| `money` | Mínimo–máximo em reais; aceita `1.234,56`; recusa mais de 2 casas e negativo | `{ min?, max? }` em **centavos** |
| `date-range` | `DateRangePicker` | `{ from?, to? }` em `AAAA-MM-DD` |

Filtros se somam (E). As contagens de `multiselect`/`status`/`select` são facetadas: cada opção conta com os demais filtros ativos, sem o próprio. A lógica (predicados, busca, contagens, chips) é pura e fica em `lib/filters.ts`.

## Estado e modos

`DataTableState = { search, filters, sort, pageIndex, pageSize, hiddenColumns, columnOrder }`. `defaultState` define o padrão da tela (ex.: pacientes abrem com `status: ["active"]`).

- **`mode="client"` (padrão)**: busca, filtro, ordenação e paginação em memória; `onRowsChange` entrega todas as linhas filtradas e ordenadas (todas as páginas), base da exportação.
- **`mode="server"`**: `manualPagination/manualSorting/manualFiltering`; o pai busca e passa `data` (a página), `total`, `state` e `onStateChange`. Usado pelo Financeiro (`/financeiro`): o `state` controlado também alimenta indicadores, gráficos e exportação, e os `filter` das colunas só declaram os controles (a API filtra, ordena e pagina).
- Estado próprio por padrão; passe `state`/`onStateChange` para controlá-lo. A página é ajustada ao intervalo válido depois de filtrar ou trocar o tamanho.

## Preferências e visões salvas (PostgreSQL)

Com `tableKey` (único por tabela, `^[a-z0-9-]{1,60}$`, conferido pelo teste de contrato), a tabela lê e grava pela API `GET/PUT/DELETE /api/v1/preferences/tables/:key[/views/:name]`, sempre do usuário da sessão. **Nada vai para `localStorage`.**

- Visão `default`: preferências de trabalho (tamanho da página, ordenação, colunas ocultas e ordem), gravadas sozinhas depois de 800 ms parados; nunca levam busca nem filtros.
- Visões nomeadas (**Visões**): guardam também busca (`_search`) e filtros. Aplicar, salvar a atual (mesmo nome substitui), marcar "abrir sempre por esta visão" (uma por tabela) e excluir (com `ConfirmDialog`). Até 20 por tabela.
- Ao abrir: padrão da tela → preferências de trabalho → visão marcada como inicial. Colunas e filtros que a tabela não conhece mais são descartados.
- Falha de rede ou 403 não quebra a tabela: ela segue com o padrão da tela; a gravação automática é silenciosa.

## DateRangePicker

`DateRangePicker` (`react-day-picker` v10, locale `ptBR`) recebe e devolve `{ from?, to? }` em `AAAA-MM-DD`.

- Presets: Hoje, Últimos 7 dias, Últimos 30 dias, Este mês, Mês passado, Este ano. "Este mês" e "Este ano" cobrem o período inteiro; os demais terminam hoje. "Hoje" vem do fuso da clínica (`America/Sao_Paulo`), não do UTC. Preset aplica na hora.
- Calendário de intervalo (2 meses a partir de 768 px, 1 no celular), seletor de mês/ano, teclado do day-picker (setas, PageUp/PageDown, Home/End), **Limpar** e **Aplicar** (o rascunho só vira valor ao aplicar). Pontas invertidas são trocadas; datas inexistentes são descartadas.
- O popover usa a camada `z-60` de `components/ui/layers.ts`: funciona dentro de dialog sem fechá-lo e devolve o foco ao gatilho.
- Valor de linha: `AAAA-MM-DD` passa direto; um instante ISO vira o dia no fuso da clínica antes de comparar.
