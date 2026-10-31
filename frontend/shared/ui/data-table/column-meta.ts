import type { RowData } from "@tanstack/react-table"

import type { FilterConfig } from "./lib/types"

/** Breakpoint a partir do qual a coluna aparece (`hidden md:table-cell` das listas antigas). */
export type ColumnBreakpoint = "sm" | "md" | "lg" | "xl"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Rótulo pt-BR no menu de colunas, nos chips e no cabeçalho exportado (padrão: o `header` textual). */
    label?: string
    align?: "left" | "right" | "center"
    /** Filtro declarativo desta coluna: o tipo escolhe o controle da toolbar e o predicado. */
    filter?: FilterConfig<TData>
    /** Valor para exportar listas em modo cliente: número, texto, data ISO ou `null` (o XLSX do Financeiro vem da API, não daqui). */
    exportValue?: (row: TData) => string | number | boolean | Date | null | undefined
    /** Trecho de texto desta coluna para a busca global (padrão: o valor do acessor quando for texto/número). */
    searchValue?: (row: TData) => string
    /** Coluna só aparece a partir deste breakpoint. */
    hideBelow?: ColumnBreakpoint
    /** Fica fora do menu "Colunas" (não pode ser ocultada). */
    alwaysVisible?: boolean
    className?: string
    headerClassName?: string
  }
}

export {}
