"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { notifyInfo } from "./notify"
import { buildUrlDialog, buildUrlParam, parseUrlDialog, URL_DIALOG_FLAG, type UrlDialogKey } from "./url-dialog"

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
 * Parâmetro de query de estado de tela (ex.: `?aba=usuarios`): a escolha vira parte do link (deep-link e F5 voltam à
 * mesma aba) sem navegar nem criar entrada no histórico. `null` quando ausente.
 */
export function useUrlParam(name: string): [string | null, (value: string | null) => void] {
  const searchParams = useSearchParams()
  const set = useCallback(
    (value: string | null) => {
      const { pathname, search, hash } = window.location
      window.history.replaceState(null, "", buildUrlParam({ pathname, search, hash }, name, value))
    },
    [name]
  )
  return [searchParams.get(name), set]
}

const DENIED_MESSAGE = "Seu perfil não tem permissão para esta ação."

/**
 * Dialog aberto pela URL só vale com permissão: link de quem não pode escrever fecha o dialog e avisa
 * (a UI apenas esconde o botão; a API continua sendo a autoridade).
 */
export function useUrlDialogGate(dialog: UrlDialog, allowed: boolean): boolean {
  const denied = dialog.isOpen && !allowed
  const { close } = dialog
  useEffect(() => {
    if (!denied) return
    notifyInfo(DENIED_MESSAGE)
    close()
  }, [denied, close])
  return dialog.isOpen && allowed
}

/**
 * Criar/editar de uma tela de LISTA: `?novo=1` abre o dialog de criação e `?editar=<id>` o de edição do registro
 * `id` da lista já carregada. Link velho (registro apagado, de outra clínica ou fora do escopo de leitura) não deixa o
 * dialog preso: depois do carregamento fecha e avisa. Sem `allowed` nenhum dos dois abre.
 */
export function useUrlEditor<T extends { id: string }>({
  items,
  isLoading,
  allowed = true,
}: {
  items: readonly T[] | undefined
  isLoading: boolean
  allowed?: boolean
}) {
  const novo = useUrlDialog("novo")
  const editar = useUrlDialog("editar")
  const novoOpen = useUrlDialogGate(novo, allowed)
  const editOpen = useUrlDialogGate(editar, allowed)
  // URL escrita à mão com os dois: `editar` vence (a ação em si nunca gera essa combinação).
  const creating = novoOpen && !editOpen

  // `openEdit(item)` guarda o objeto: quem abre logo depois de criar (ex.: retificar um registro) não espera a lista recarregar.
  const [opened, setOpened] = useState<T>()
  const target = editar.value ? (items?.find((item) => item.id === editar.value) ?? (opened?.id === editar.value ? opened : undefined)) : undefined
  const missing = editOpen && !isLoading && !!items && !target
  const { close: closeEdit } = editar
  useEffect(() => {
    if (!missing) return
    notifyInfo("Não encontramos o registro deste link.")
    closeEdit()
  }, [missing, closeEdit])

  const { open: openNewFlag, close: closeNew } = novo
  const { open: openEditId } = editar
  const openNew = useCallback(() => openNewFlag(), [openNewFlag])
  const openEdit = useCallback(
    (item: T) => {
      setOpened(item)
      openEditId(item.id)
    },
    [openEditId]
  )
  const close = useCallback(() => {
    closeNew()
    closeEdit()
  }, [closeNew, closeEdit])

  return { creating, editing: editOpen ? target : undefined, openNew, openEdit, close }
}
