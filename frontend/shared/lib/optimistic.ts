import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query"

/**
 * Núcleo (sem React) das mutations otimistas do painel. TanStack Query continua sendo a única
 * fonte de dados: aqui só se corrige o cache antes da resposta, se desfaz em caso de erro e se
 * reconcilia com o servidor ao final.
 */

/**
 * Ajuste otimista sobre um cache. `update` é puro e tipado pelo dado da query (`TData`) e pelas
 * variáveis da mutation (`TVars`); só roda em queries que já têm dado em cache.
 */
export interface OptimisticPatch<TVars> {
  readonly queryKey: QueryKey
  /** `true` casa só a chave informada; por padrão casa por prefixo (todas as variações de filtro). */
  readonly exact: boolean
  readonly apply: (current: unknown, vars: TVars) => unknown
}

export function optimisticPatch<TData, TVars>(
  queryKey: QueryKey,
  update: (current: TData, vars: TVars) => TData,
  options: { exact?: boolean } = {}
): OptimisticPatch<TVars> {
  return {
    queryKey,
    exact: options.exact ?? false,
    // O cast fica aqui: quem cria o patch declara o formato do cache e o `update` é checado contra ele.
    apply: (current, vars) => (current === undefined ? undefined : update(current as TData, vars)),
  }
}

/** Uma query afetada: dado anterior e dado aplicado (referência final guardada no cache). */
export interface SnapshotEntry {
  readonly queryKey: QueryKey
  readonly previous: unknown
  readonly applied: unknown
}

export type QuerySnapshot = readonly SnapshotEntry[]

/** Cancela refetches em andamento (eles sobrescreveriam o dado otimista) e aplica os patches. */
export async function applyOptimistic<TVars>(
  client: QueryClient,
  patches: readonly OptimisticPatch<TVars>[],
  vars: TVars
): Promise<QuerySnapshot> {
  await Promise.all(patches.map((p) => client.cancelQueries({ queryKey: p.queryKey, exact: p.exact })))

  const previousByHash = new Map<string, { queryKey: QueryKey; previous: unknown }>()
  for (const patch of patches) {
    for (const [queryKey, previous] of client.getQueriesData({ queryKey: patch.queryKey, exact: patch.exact })) {
      const hash = hashKey(queryKey)
      if (!previousByHash.has(hash)) previousByHash.set(hash, { queryKey, previous })
    }
    client.setQueriesData({ queryKey: patch.queryKey, exact: patch.exact }, (current: unknown) => patch.apply(current, vars))
  }

  return [...previousByHash.values()]
    .filter((entry) => entry.previous !== undefined)
    .map(({ queryKey, previous }) => ({ queryKey, previous, applied: client.getQueryData(queryKey) }))
}

/**
 * Desfaz o patch só nas queries que ainda guardam o dado que ele escreveu. Se outra mutation ou um
 * refetch já alterou a query, restaurar o snapshot apagaria esse dado mais novo: nesse caso a
 * reconciliação fica por conta da invalidação ao final. Devolve as chaves realmente restauradas.
 */
export function rollbackOptimistic(client: QueryClient, snapshot: QuerySnapshot): QueryKey[] {
  const restored: QueryKey[] = []
  for (const entry of snapshot) {
    if (client.getQueryData(entry.queryKey) !== entry.applied) continue
    client.setQueryData(entry.queryKey, entry.previous)
    restored.push(entry.queryKey)
  }
  return restored
}

function startsWith(key: QueryKey, prefix: QueryKey) {
  return prefix.length <= key.length && prefix.every((part, i) => hashKey([part]) === hashKey([key[i]]))
}

/** Chaves relacionadas: iguais ou uma é prefixo da outra (ex.: `["patients"]` e `["patients", "guardians", id]`). */
export function keysRelated(a: QueryKey, b: QueryKey) {
  return startsWith(a, b) || startsWith(b, a)
}

interface LedgerEntry {
  keys: QueryKey[]
  deferred: QueryKey[]
}

/**
 * Registro de mutations em voo por QueryClient. Invalidar enquanto outra mutation relacionada ainda
 * não respondeu refaria o fetch por cima do dado otimista dela (e o servidor ainda não tem o efeito).
 * A invalidação bloqueada é repassada à mutation que bloqueia, que a executa ao terminar.
 */
export class MutationLedger {
  private readonly entries = new Map<symbol, LedgerEntry>()

  begin(keys: readonly QueryKey[]): symbol {
    const token = Symbol("api-mutation")
    this.entries.set(token, { keys: [...keys], deferred: [] })
    return token
  }

  /** Encerra a mutation e devolve as chaves que já podem ser invalidadas com segurança. */
  settle(token: symbol): QueryKey[] {
    const entry = this.entries.get(token)
    if (!entry) return []
    this.entries.delete(token)

    const ready = new Map<string, QueryKey>()
    for (const key of [...entry.keys, ...entry.deferred]) {
      const blocker = [...this.entries.values()].find((other) => other.keys.some((k) => keysRelated(k, key)))
      if (blocker) blocker.deferred.push(key)
      else ready.set(hashKey(key), key)
    }
    return [...ready.values()]
  }

  get inFlight() {
    return this.entries.size
  }
}

const ledgers = new WeakMap<QueryClient, MutationLedger>()

export function mutationLedger(client: QueryClient) {
  let ledger = ledgers.get(client)
  if (!ledger) {
    ledger = new MutationLedger()
    ledgers.set(client, ledger)
  }
  return ledger
}

/** Atualiza o item de `id` numa lista em cache. */
export function patchById<T extends { id: string }>(list: readonly T[], id: string, change: (item: T) => T): T[] {
  return list.map((item) => (item.id === id ? change(item) : item))
}

/** Remove o item de `id` de uma lista em cache. */
export function removeById<T extends { id: string }>(list: readonly T[], id: string): T[] {
  return list.filter((item) => item.id !== id)
}
