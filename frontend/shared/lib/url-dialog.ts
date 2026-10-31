/**
 * Dialog controlado pela URL (`?novo=1`, `?editar=<id|1>`): lógica pura, sem React nem Next, para testar sem DOM.
 * O hook `use-url-dialog.ts` só liga estas funções ao `history`.
 */

export type UrlDialogKey = "editar" | "novo"

/** Chaves mutuamente exclusivas: abrir uma remove a outra. */
export const URL_DIALOG_KEYS: readonly UrlDialogKey[] = ["editar", "novo"]

/** Valor do parâmetro quando não há id: `?novo=1`, `?editar=1` (detalhe: o registro é o da própria página). */
export const URL_DIALOG_FLAG = "1"

/** Ids de API (uuid, slug, código): qualquer outra coisa na URL é ignorada em vez de chegar à tela. */
const VALUE_PATTERN = /^[\w.-]{1,100}$/

export interface UrlDialogLocation {
  pathname: string
  search: string
  hash?: string
}

export interface UrlDialogState {
  isOpen: boolean
  /** `"1"` para `novo`/`editar=1`; o id para `editar=<id>`; `null` com o dialog fechado. */
  value: string | null
}

const paramsOf = (search: string | URLSearchParams) => (typeof search === "string" ? new URLSearchParams(search) : search)

/** O que a URL pede para `key`. Valor vazio ou fora do padrão conta como fechado. */
export function parseUrlDialog(search: string | URLSearchParams, key: UrlDialogKey): UrlDialogState {
  const raw = paramsOf(search).get(key)
  if (raw === null || !VALUE_PATTERN.test(raw)) return { isOpen: false, value: null }
  return { isOpen: true, value: raw }
}

/**
 * Nova URL (caminho + query + hash) com o dialog `key` aberto (`value`) ou fechado (`null`).
 * Preserva os demais parâmetros (`?aba=`, filtros) e o hash; ao abrir, fecha o dialog irmão.
 */
export function buildUrlDialog(location: UrlDialogLocation, key: UrlDialogKey, value: string | null): string {
  const params = new URLSearchParams(location.search)
  if (value === null) {
    params.delete(key)
  } else {
    if (!VALUE_PATTERN.test(value)) throw new Error(`Valor inválido para ?${key}=`)
    for (const other of URL_DIALOG_KEYS) params.delete(other)
    params.set(key, value)
  }
  const query = params.toString()
  return `${location.pathname}${query ? `?${query}` : ""}${location.hash ?? ""}`
}
