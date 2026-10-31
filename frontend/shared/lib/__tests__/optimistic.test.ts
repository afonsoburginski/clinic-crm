import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import {
  applyOptimistic,
  keysRelated,
  MutationLedger,
  mutationLedger,
  optimisticPatch,
  patchById,
  removeById,
  rollbackOptimistic,
} from "../optimistic"

interface Item {
  id: string
  label: string
}

const items = (): Item[] => [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
]

function seed(client: QueryClient) {
  client.setQueryData(["items", "u1", { day: 1 }], items())
  client.setQueryData(["items", "u1", { day: 2 }], items())
  client.setQueryData(["other"], items())
}

const rename = optimisticPatch<Item[], { id: string; label: string }>(["items"], (list, vars) =>
  patchById(list, vars.id, (item) => ({ ...item, label: vars.label }))
)

describe("applyOptimistic", () => {
  it("aplica o patch em todas as queries do prefixo e devolve o snapshot anterior", async () => {
    const client = new QueryClient()
    seed(client)

    const snapshot = await applyOptimistic(client, [rename], { id: "a", label: "A!" })

    expect(client.getQueryData<Item[]>(["items", "u1", { day: 1 }])?.[0].label).toBe("A!")
    expect(client.getQueryData<Item[]>(["items", "u1", { day: 2 }])?.[0].label).toBe("A!")
    expect(client.getQueryData<Item[]>(["other"])?.[0].label).toBe("A")
    expect(snapshot).toHaveLength(2)
    expect(snapshot.every((entry) => (entry.previous as Item[])[0].label === "A")).toBe(true)
  })

  it("ignora queries sem dado em cache", async () => {
    const client = new QueryClient()
    client.getQueryCache().build(client, { queryKey: ["items", "empty"] })

    const snapshot = await applyOptimistic(client, [rename], { id: "a", label: "x" })

    expect(snapshot).toEqual([])
    expect(client.getQueryData(["items", "empty"])).toBeUndefined()
  })

  it("exact casa só a chave informada", async () => {
    const client = new QueryClient()
    client.setQueryData(["pros"], [{ id: "p", label: "lista" }])
    client.setQueryData(["pros", "p"], { id: "p", label: "detalhe" })
    const onList = optimisticPatch<Item[], string>(["pros"], (list, label) => list.map((i) => ({ ...i, label })), { exact: true })

    await applyOptimistic(client, [onList], "novo")

    expect(client.getQueryData<Item[]>(["pros"])?.[0].label).toBe("novo")
    expect(client.getQueryData<Item>(["pros", "p"])?.label).toBe("detalhe")
  })

  it("cancela refetch em voo para ele não sobrescrever o dado otimista", async () => {
    const client = new QueryClient()
    let release!: (value: Item[]) => void
    const pending = new Promise<Item[]>((resolve) => (release = resolve))
    client.setQueryData(["items", "u1"], items())
    const refetch = client.fetchQuery({ queryKey: ["items", "u1"], queryFn: () => pending, staleTime: 0 }).catch(() => undefined)

    await applyOptimistic(client, [rename], { id: "a", label: "otimista" })
    release([{ id: "a", label: "servidor antigo" }])
    await refetch

    expect(client.getQueryData<Item[]>(["items", "u1"])?.[0].label).toBe("otimista")
  })
})

describe("rollbackOptimistic", () => {
  it("restaura o estado anterior quando nada mexeu na query depois do patch", async () => {
    const client = new QueryClient()
    seed(client)
    const snapshot = await applyOptimistic(client, [rename], { id: "a", label: "A!" })

    const restored = rollbackOptimistic(client, snapshot)

    expect(restored).toHaveLength(2)
    expect(client.getQueryData(["items", "u1", { day: 1 }])).toEqual(items())
    expect(client.getQueryData(["items", "u1", { day: 2 }])).toEqual(items())
  })

  it("não apaga dado mais novo escrito por outra mutation", async () => {
    const client = new QueryClient()
    seed(client)
    const first = await applyOptimistic(client, [rename], { id: "a", label: "primeira" })
    await applyOptimistic(client, [rename], { id: "b", label: "segunda" })

    rollbackOptimistic(client, first)

    const list = client.getQueryData<Item[]>(["items", "u1", { day: 1 }])
    expect(list?.map((i) => i.label)).toEqual(["primeira", "segunda"])
  })
})

describe("keysRelated", () => {
  it("relaciona chaves iguais e prefixos nos dois sentidos", () => {
    expect(keysRelated(["patients"], ["patients", "guardians", "p1"])).toBe(true)
    expect(keysRelated(["patients", "guardians", "p1"], ["patients"])).toBe(true)
    expect(keysRelated(["a", { x: 1, y: 2 }], ["a", { y: 2, x: 1 }])).toBe(true)
    expect(keysRelated(["patients", "guardians", "p1"], ["patients", "guardians", "p2"])).toBe(false)
    expect(keysRelated(["audit"], ["dashboard"])).toBe(false)
  })
})

describe("MutationLedger", () => {
  it("libera a invalidação quando não há outra mutation relacionada em voo", () => {
    const ledger = new MutationLedger()
    const token = ledger.begin([["items"], ["audit"]])

    expect(ledger.settle(token)).toEqual([["items"], ["audit"]])
    expect(ledger.inFlight).toBe(0)
  })

  it("repassa a invalidação bloqueada para quem bloqueia e executa quando ela termina", () => {
    const ledger = new MutationLedger()
    const a = ledger.begin([["items"], ["audit"]])
    const b = ledger.begin([["items", "u1"], ["audit"]])

    // A termina primeiro, mas B (relacionada) ainda está em voo: nada é invalidado agora.
    expect(ledger.settle(a)).toEqual([])
    // B termina: invalida o que era dela e o que A deixou pendente.
    const ready = ledger.settle(b)
    expect(ready).toEqual(expect.arrayContaining([["items", "u1"], ["audit"], ["items"]]))
    expect(ready).toHaveLength(3)
  })

  it("não bloqueia chaves de domínios diferentes", () => {
    const ledger = new MutationLedger()
    const a = ledger.begin([["items"]])
    ledger.begin([["rooms"]])

    expect(ledger.settle(a)).toEqual([["items"]])
  })

  it("settle de token desconhecido é seguro", () => {
    expect(new MutationLedger().settle(Symbol("x"))).toEqual([])
  })

  it("mutationLedger reutiliza a instância por QueryClient", () => {
    const client = new QueryClient()
    expect(mutationLedger(client)).toBe(mutationLedger(client))
    expect(mutationLedger(new QueryClient())).not.toBe(mutationLedger(client))
  })
})

describe("helpers de lista", () => {
  it("patchById e removeById não mutam a lista original", () => {
    const list = items()
    expect(patchById(list, "a", (i) => ({ ...i, label: "x" }))[0].label).toBe("x")
    expect(removeById(list, "a")).toEqual([{ id: "b", label: "B" }])
    expect(list).toEqual(items())
  })
})
