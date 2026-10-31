import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const read = (path: string) => readFileSync(join(ROOT, path), "utf8")
const modules = sourceFiles("modules").map((path) => ({ path, source: read(path) }))

describe("contrato do menu de contexto", () => {
  it("toda tabela do app (tableKey) liga o menu de ações da linha", () => {
    const tables = modules.filter(({ source }) => /tableKey="/.test(source))
    expect(tables.length).toBeGreaterThanOrEqual(12)
    expect(tables.filter(({ source }) => !/rowActions=/.test(source)).map(({ path }) => path)).toEqual([])
  })

  it("as ações vêm de funções puras *-actions.ts por módulo (testáveis sem DOM) e não importam React", () => {
    const files = modules.filter(({ path }) => /\/lib\/(?!use-)[a-z-]*-actions\.ts$/.test(path))
    expect(files.length).toBeGreaterThanOrEqual(10)
    for (const { path, source } of files) expect([path, /from "react"/.test(source)]).toEqual([path, false])
  })

  it("nenhum módulo monta menu próprio: usam o EntityMenu/ContextMenu base (sem ContextMenu do base-ui direto)", () => {
    const direct = [...modules, ...sourceFiles("shared").map((path) => ({ path, source: read(path) }))]
      .filter(({ path, source }) => /@base-ui\/react\/context-menu/.test(source) && path !== "components/ui/context-menu.tsx")
      .map(({ path }) => path)
    expect(direct).toEqual([])
  })

  it("o menu de contexto usa a escala de camadas (aparece por cima de dialogs)", () => {
    expect(read("components/ui/context-menu.tsx")).toContain("LAYERS.popover")
  })

  it("não há exclusão inventada: nenhuma ação de menu chama delete/remove de recurso fora do vínculo", () => {
    const files = modules.filter(({ path }) => /\/lib\/(?!use-)[a-z-]*-actions\.ts$/.test(path))
    const ids = files.flatMap(({ source }) => [...source.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]))
    expect(ids.filter((id) => /^(delete|excluir|destroy)$/.test(id))).toEqual([])
  })
})
