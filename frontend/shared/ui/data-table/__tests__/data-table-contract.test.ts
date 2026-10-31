import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path)
    return entry.name.endsWith(".tsx") ? [path] : []
  })
}

const files = sourceFiles("modules").map((path) => ({ path, source: readFileSync(join(ROOT, path), "utf8") }))
const keys = files.flatMap(({ path, source }) => [...source.matchAll(/tableKey="([^"]*)"/g)].map((m) => ({ path, key: m[1] })))

/** A API só aceita `table_key` casando com `^[a-z0-9-]{1,60}$`; chave repetida misturaria as visões de duas telas. */
describe("contrato das tabelas", () => {
  it("toda tabela do app tem tableKey válido e único", () => {
    expect(keys.length).toBeGreaterThanOrEqual(10)
    for (const { key, path } of keys) expect([path, /^[a-z0-9-]{1,60}$/.test(key)]).toEqual([path, true])
    const repeated = keys.filter(({ key }, i) => keys.findIndex((other) => other.key === key) !== i)
    expect(repeated).toEqual([])
  })

  it("as listas principais usam o DataTable e não montam <Table> própria", () => {
    const expected = ["patients", "guardians", "professionals", "services", "rooms", "aba-plans", "assessments", "documents", "audit", "users", "financial-entries"]
    expect(keys.map((k) => k.key)).toEqual(expect.arrayContaining(expected))
    const raw = files.filter(({ source }) => /from "@\/components\/ui\/table"/.test(source)).map(({ path }) => path)
    // A matriz de permissões (papel × permissão) não é uma lista de registros.
    expect(raw).toEqual(["modules/users/components/roles-tab.tsx"])
  })
})
