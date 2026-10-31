import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DomainError } from "@/domain/errors"

import { createApiMutationOptions } from "../use-api-mutation"
import { optimisticPatch, patchById, type QuerySnapshot } from "../optimistic"

const notify = vi.hoisted(() => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }))
vi.mock("../notify", () => notify)

interface Item {
  id: string
  label: string
}
interface Vars {
  id: string
  label: string
}

const rename = optimisticPatch<Item[], Vars>(["items"], (list, vars) => patchById(list, vars.id, (item) => ({ ...item, label: vars.label })))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })
  client.setQueryData<Item[]>(["items"], [{ id: "a", label: "A" }])
  const server: Item[] = [{ id: "a", label: "A" }]
  const queryFn = vi.fn(async () => server.map((item) => ({ ...item })))
  // Observador ativo: invalidar refaz o fetch e traz o estado do "servidor" para o cache.
  const observer = new QueryObserver(client, { queryKey: ["items"], queryFn })
  observer.subscribe(() => {})
  return { client, server, queryFn }
}

function labels(client: QueryClient) {
  return client.getQueryData<Item[]>(["items"])?.map((i) => i.label)
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  notify.notifyError.mockClear()
  notify.notifySuccess.mockClear()
})

describe("createApiMutationOptions", () => {
  it("aplica o patch antes da resposta e reconcilia com o servidor ao final", async () => {
    const { client, server, queryFn } = setup()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => (finish = resolve))
    const seenInMutate: Array<string[] | undefined> = []

    const observer = new MutationObserver(
      client,
      createApiMutationOptions<Vars, Item>(
        client,
        async (vars) => {
          await gate
          server[0].label = vars.label
          return server[0]
        },
        {
          invalidate: [["items"]],
          optimistic: [rename],
          success: "Salvo.",
          onMutate: () => seenInMutate.push(labels(client)),
        }
      )
    )

    const done = observer.mutate({ id: "a", label: "Novo" })
    await tick()
    expect(labels(client)).toEqual(["Novo"]) // otimista, servidor ainda não respondeu
    expect(seenInMutate).toEqual([["Novo"]])

    finish()
    await done
    expect(labels(client)).toEqual(["Novo"]) // servidor confirmou e o refetch trouxe o mesmo valor
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(notify.notifySuccess).toHaveBeenCalledWith("Salvo.")
    expect(client.getQueryState(["items"])?.isInvalidated).toBe(false)
  })

  it("faz rollback por snapshot, chama onRollback e notifica o erro", async () => {
    const { client } = setup()
    const rollbacks: Array<{ error: unknown; snapshot: QuerySnapshot }> = []
    const error = new DomainError("Transição inválida.")

    const observer = new MutationObserver(
      client,
      createApiMutationOptions<Vars, Item>(
        client,
        async () => {
          throw error
        },
        {
          invalidate: [["items"]],
          optimistic: [rename],
          onRollback: (e, _vars, snapshot) => rollbacks.push({ error: e, snapshot }),
        }
      )
    )

    await expect(observer.mutate({ id: "a", label: "Novo" })).rejects.toBe(error)

    expect(labels(client)).toEqual(["A"])
    expect(rollbacks).toHaveLength(1)
    expect(rollbacks[0].error).toBe(error)
    expect((rollbacks[0].snapshot[0].previous as Item[])[0].label).toBe("A")
    expect(notify.notifyError).toHaveBeenCalledWith(error)
  })

  it("silentError não notifica, mas ainda faz rollback", async () => {
    const { client } = setup()
    const observer = new MutationObserver(
      client,
      createApiMutationOptions<Vars, Item>(
        client,
        async () => {
          throw new DomainError("x")
        },
        { invalidate: [["items"]], optimistic: [rename], silentError: true }
      )
    )

    await expect(observer.mutate({ id: "a", label: "Novo" })).rejects.toBeInstanceOf(DomainError)

    expect(labels(client)).toEqual(["A"])
    expect(notify.notifyError).not.toHaveBeenCalled()
  })

  it("invalida também em erro, para reconciliar com o servidor", async () => {
    const { client, queryFn, server } = setup()
    const observer = new MutationObserver(
      client,
      createApiMutationOptions<Vars, Item>(
        client,
        async () => {
          throw new DomainError("falhou")
        },
        { invalidate: [["items"]], optimistic: [rename], silentError: true }
      )
    )
    server[0].label = "Servidor"
    queryFn.mockClear()

    await expect(observer.mutate({ id: "a", label: "Novo" })).rejects.toBeDefined()

    expect(queryFn).toHaveBeenCalledTimes(1) // refetch depois do rollback
    expect(labels(client)).toEqual(["Servidor"])
  })

  it("adia a invalidação enquanto outra mutation relacionada está em voo", async () => {
    const { client } = setup()
    let finishSlow!: () => void
    const slowGate = new Promise<void>((resolve) => (finishSlow = resolve))
    const invalidated: string[] = []
    const spy = vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => {
      invalidated.push(JSON.stringify(filters?.queryKey))
    })

    const slow = new MutationObserver(
      client,
      createApiMutationOptions<Vars, null>(client, async () => (await slowGate, null), { invalidate: [["items"]], optimistic: [rename] })
    )
    const fast = new MutationObserver(
      client,
      createApiMutationOptions<Vars, null>(client, async () => null, { invalidate: [["items"]], optimistic: [rename] })
    )

    const slowDone = slow.mutate({ id: "a", label: "lenta" })
    await tick()
    await fast.mutate({ id: "a", label: "rapida" })
    // A rápida terminou, mas a lenta (mesmo prefixo) ainda não: nenhuma invalidação por cima do otimista.
    expect(invalidated).toEqual([])

    finishSlow()
    await slowDone
    expect(invalidated).toContain(JSON.stringify(["items"]))
    spy.mockRestore()
  })

  it("sem patches se comporta como a mutation anterior: invalida e chama onSuccess depois", async () => {
    const { client } = setup()
    const order: string[] = []
    const spy = vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => {
      order.push(`invalidate:${JSON.stringify(filters?.queryKey)}`)
    })

    const observer = new MutationObserver(
      client,
      createApiMutationOptions<Vars, string>(client, async () => "ok", {
        invalidate: [["items"]],
        onSuccess: (result) => order.push(`success:${result}`),
        onSettled: () => order.push("settled"),
      })
    )

    await observer.mutate({ id: "a", label: "x" })

    expect(order).toEqual([
      `invalidate:${JSON.stringify(["items"])}`,
      `invalidate:${JSON.stringify(["audit"])}`,
      `invalidate:${JSON.stringify(["dashboard"])}`,
      "success:ok",
      "settled",
    ])
    spy.mockRestore()
  })
})
