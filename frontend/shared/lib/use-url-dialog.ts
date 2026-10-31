"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useEffect } from "react"

import { notifyInfo } from "./notify"
import { buildUrlDialog, parseUrlDialog, URL_DIALOG_FLAG, type UrlDialogKey } from "./url-dialog"

export interface UrlDialog {
  isOpen: boolean
  /** `"1"` (novo ou editar sem id) ou o id do registro; `null` com o dialog fechado. */
  value: string | null
  open: (value?: string) => void
  close: () => void
}

/**
 * Dialog de criar/editar controlado pela URL: `useUrlDialog("novo")` ↔ `?novo=1`, `useUrlDialog("editar")` ↔ `?editar=<id|1>`.
 *
 * - Troca a URL com `history.replaceState` (integrado ao roteador do Next: `useSearchParams` reage). Não navega, não
 *   refaz a rota, não remonta a página (aba ativa, filtros e scroll ficam como estão) e não cria entrada no histórico:
 *   "Voltar" sai da página, não "fecha o dialog". Deep-link (`/pacientes/p1?editar=1`, F5) abre o dialog direto.
 * - Mantém os outros parâmetros (`?aba=`, filtros) e o hash; abrir `novo` fecha `editar` e vice-versa.
 * - `useSearchParams` exige `Suspense` acima: o `PanelShell` já envolve todas as telas do painel.
 */
export function useUrlDialog(key: UrlDialogKey): UrlDialog {
  const searchParams = useSearchParams()
  const { isOpen, value } = parseUrlDialog(searchParams, key)

  const navigate = useCallback(
    (next: string | null) => {
      const { pathname: current, search, hash } = window.location
      window.history.replaceState(null, "", buildUrlDialog({ pathname: current, search, hash }, key, next))
    },
    [key]
  )
  const open = useCallback((next: string = URL_DIALOG_FLAG) => navigate(next), [navigate])
  const close = useCallback(() => navigate(null), [navigate])

  return { isOpen, value, open, close }
}

/**
 * Registro de `?editar=<id>` dentro de uma lista já carregada. Link velho (registro apagado, outra clínica ou sem
 * permissão de leitura) não deixa o dialog preso: depois do carregamento, fecha e avisa.
 */
export function useUrlEditTarget<T extends { id: string }>(editar: UrlDialog, items: readonly T[] | undefined, isLoading: boolean) {
  const target = editar.value ? items?.find((item) => item.id === editar.value) : undefined
  const missing = editar.isOpen && !isLoading && !!items && !target
  const { close } = editar
  useEffect(() => {
    if (!missing) return
    notifyInfo("Não encontramos o registro deste link.")
    close()
  }, [missing, close])
  return target
}
