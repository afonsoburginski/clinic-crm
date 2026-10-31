import { beforeEach, describe, expect, test } from "bun:test"
import { DomainError } from "@/application/errors"
import { createTablePreferenceUseCases } from "@/application/use-cases/table-preferences"
import { MAX_VIEWS_PER_TABLE } from "@/domain/table-preferences"
import { FakeTablePreferenceRepository } from "./fakes/table-preferences-repository"

const clinicId = "clinic"
const ana = { userId: "ana", roles: ["reception"] }
const bruno = { userId: "bruno", roles: ["finance"] }

let repository: FakeTablePreferenceRepository
let useCases: ReturnType<typeof createTablePreferenceUseCases>
beforeEach(() => {
  repository = new FakeTablePreferenceRepository()
  useCases = createTablePreferenceUseCases(repository)
})

const save = (actor = ana, viewName = "Pendentes", body: unknown = { pageSize: 20 }, tableKey = "financial-entries") =>
  useCases.commands.saveView({ clinicId, actor, tableKey, viewName, body })
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error("expected a failure")
}

describe("table preferences use cases", () => {
  test("the scope is always the actor of the session and the clinic", async () => {
    await save(ana)
    await useCases.queries.listViews({ clinicId, actor: bruno, tableKey: "financial-entries" })
    expect(repository.scopes).toEqual([
      { clinicId, userId: "ana", tableKey: "financial-entries" },
      { clinicId, userId: "bruno", tableKey: "financial-entries" },
    ])
  })

  test("a user never sees another user's views", async () => {
    await save(ana)
    expect(await useCases.queries.listViews({ clinicId, actor: bruno, tableKey: "financial-entries" })).toEqual([])
    expect(await useCases.queries.listViews({ clinicId, actor: ana, tableKey: "financial-entries" })).toHaveLength(1)
    expect(await useCases.queries.listViews({ clinicId, actor: ana, tableKey: "patients" })).toEqual([])
  })

  test("anonymous and system callers are refused", async () => {
    for (const actor of [{ userId: "", roles: [] }, { userId: "system", roles: [] }]) {
      expect((await failure(save(actor))).message).toBe("unauthorized")
    }
  })

  test("invalid input is a validation error with a pt-BR message", async () => {
    for (const run of [
      () => save(ana, "Pendentes", { pageSize: 0 }, "financial-entries"),
      () => save(ana, "", {}),
      () => save(ana, "Pendentes", {}, "Bad Key"),
      () => useCases.queries.listViews({ clinicId, actor: ana, tableKey: "../x" }),
      () => useCases.commands.deleteView({ clinicId, actor: ana, tableKey: "financial-entries", viewName: "" }),
    ]) {
      const error = await failure(run())
      expect(error).toBeInstanceOf(DomainError)
      expect(error.message).toBe("validation")
      expect((error as DomainError).detail.length).toBeGreaterThan(5)
    }
    expect(repository.views.size).toBe(0)
  })

  test("saving as initial unmarks the previous initial view", async () => {
    await save(ana, "A", { isDefault: true })
    await save(ana, "B", { isDefault: true })
    const views = await useCases.queries.listViews({ clinicId, actor: ana, tableKey: "financial-entries" })
    expect(views.filter((view) => view.isDefault).map((view) => view.name)).toEqual(["B"])
  })

  test("the view limit blocks new views but not updates of existing ones", async () => {
    for (let i = 0; i < MAX_VIEWS_PER_TABLE; i++) await save(ana, `v${i}`)
    const error = await failure(save(ana, "extra"))
    expect(error.message).toBe("conflict")
    expect((error as DomainError).detail).toContain(String(MAX_VIEWS_PER_TABLE))
    await expect(save(ana, "v0", { pageSize: 100 })).resolves.toMatchObject({ name: "v0", pageSize: 100 })
  })

  test("deleting a view that does not exist is not_found", async () => {
    expect((await failure(useCases.commands.deleteView({ clinicId, actor: ana, tableKey: "financial-entries", viewName: "x" }))).message).toBe("not_found")
    await save(ana, "x")
    await expect(useCases.commands.deleteView({ clinicId, actor: ana, tableKey: "financial-entries", viewName: "x" })).resolves.toEqual({ ok: true })
  })
})
