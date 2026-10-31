export { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./types"

export const pageCountOf = (total: number, pageSize: number) => Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))

/** Mantém a página dentro de `[0, pageCount - 1]` (ex.: depois de filtrar ou trocar o tamanho). */
export const clampPage = (pageIndex: number, pageCount: number) => Math.min(Math.max(0, Math.floor(pageIndex) || 0), Math.max(0, pageCount - 1))

/** Faixa 1-based e inclusiva da página (`0–0` quando não há linhas): "Mostrando 21–40 de 53". */
export function pageWindow(pageIndex: number, pageSize: number, total: number) {
  if (total <= 0) return { from: 0, to: 0 }
  const from = pageIndex * pageSize + 1
  return { from, to: Math.min(total, from + pageSize - 1) }
}

export const paginate = <T>(rows: readonly T[], pageIndex: number, pageSize: number): T[] =>
  rows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

/** "Ir para a página": texto digitado (1-based) → índice 0-based dentro do intervalo; texto inválido → `null`. */
export function parsePageInput(text: string, pageCount: number): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const page = Number(trimmed)
  if (page < 1) return null
  return clampPage(page - 1, pageCount)
}
