"use client"

import { useMutation, useQueryClient, type QueryClient, type QueryKey, type UseMutationOptions } from "@tanstack/react-query"

import { notifyError, notifySuccess } from "./notify"
import {
  applyOptimistic,
  mutationLedger,
  rollbackOptimistic,
  type OptimisticPatch,
  type QuerySnapshot,
} from "./optimistic"

/** Toda escrita alimenta a auditoria e os indicadores da visão geral. */
const ALWAYS_INVALIDATE: QueryKey[] = [["audit"], ["dashboard"]]

export interface ApiMutationOptions<TVars, TResult> {
  /** Caches afetados; são reconciliados com o servidor quando a mutation termina (sucesso ou erro). */
  invalidate: QueryKey[]
  success?: string | ((result: TResult, vars: TVars) => string)
  silentError?: boolean
  /**
   * Ajustes aplicados ao cache antes da chamada (ver `optimisticPatch`). Em erro são desfeitos a
   * partir do snapshot; a invalidação ao final garante que o cache volte a refletir o servidor.
   */
  optimistic?: readonly OptimisticPatch<TVars>[]
  /** Depois dos patches: recebe o snapshot do que foi alterado (útil para estado local derivado). */
  onMutate?: (vars: TVars, snapshot: QuerySnapshot) => void
  /** Depois do rollback do cache. `snapshot` é o estado anterior das queries tocadas. */
  onRollback?: (error: unknown, vars: TVars, snapshot: QuerySnapshot) => void
  /** Chamado depois da invalidação segura, só em sucesso. */
  onSuccess?: (result: TResult, vars: TVars) => void
  /** Chamado ao final em qualquer desfecho, depois da invalidação segura. */
  onSettled?: (result: TResult | undefined, error: unknown, vars: TVars) => void
}

interface ApiMutationContext {
  token: symbol
  keys: QueryKey[]
  snapshot: QuerySnapshot
}

/** Opções do `useMutation` — separadas do hook para testar o ciclo de vida sem React. */
export function createApiMutationOptions<TVars, TResult>(
  client: QueryClient,
  fn: (vars: TVars) => Promise<TResult>,
  options: ApiMutationOptions<TVars, TResult>
): UseMutationOptions<TResult, unknown, TVars, ApiMutationContext> {
  const patches = options.optimistic ?? []
  const ledger = mutationLedger(client)

  return {
    mutationFn: fn,
    onMutate: async (vars) => {
      // O registro vem antes de qualquer await: mutations concorrentes já enxergam esta como em voo.
      const keys = [...options.invalidate, ...patches.map((p) => p.queryKey), ...ALWAYS_INVALIDATE]
      const token = ledger.begin(keys)
      try {
        const snapshot = patches.length ? await applyOptimistic(client, patches, vars) : []
        options.onMutate?.(vars, snapshot)
        return { token, keys, snapshot }
      } catch (error) {
        // Sem contexto o onSettled não consegue encerrar o registro: libera aqui para não bloquear invalidações.
        ledger.settle(token)
        throw error
      }
    },
    onSuccess: (result, vars) => {
      if (options.success) {
        notifySuccess(typeof options.success === "function" ? options.success(result, vars) : options.success)
      }
    },
    onError: (error, vars, context) => {
      if (context) {
        rollbackOptimistic(client, context.snapshot)
        options.onRollback?.(error, vars, context.snapshot)
      }
      if (!options.silentError) notifyError(error)
    },
    onSettled: async (result, error, vars, context) => {
      const keys = context ? ledger.settle(context.token) : []
      await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })))
      if (!error) options.onSuccess?.(result as TResult, vars)
      options.onSettled?.(result, error, vars)
    },
  }
}

/**
 * Mutation padrão do painel: invalida as chaves afetadas (e a auditoria, que toda escrita alimenta),
 * mostra toast de sucesso e mapeia erros de domínio. Com `optimistic`, aplica o efeito esperado ao
 * cache de imediato, faz rollback por snapshot em caso de erro e só invalida quando nenhuma outra
 * mutation relacionada está em voo.
 */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: ApiMutationOptions<TVars, TResult>
) {
  const client = useQueryClient()
  return useMutation(createApiMutationOptions(client, fn, options))
}
