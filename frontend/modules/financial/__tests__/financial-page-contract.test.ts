import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** Sem DOM runner: guarda por leitura de código as garantias da página que um teste de lógica não alcança. */
const root = join(__dirname, "..")
const read = (file: string) => readFileSync(join(root, file), "utf8")
const sources = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

describe("FIN — página /financeiro (contrato do código)", () => {
  it("o botão de exportar só existe dentro de PermissionGate finance:export", () => {
    const button = read("components/export-xlsx-button.tsx")
    expect(button).toMatch(/<PermissionGate permission="finance:export">[\s\S]*Exportar XLSX[\s\S]*<\/PermissionGate>/)
    expect(button).toContain("Exportando…")
    expect(read("components/financial-view.tsx")).toContain("<ExportXlsxButton filters={filters} />")
  })

  it("o exceljs só entra por import dinâmico (fora do bundle até o clique)", () => {
    for (const file of sources(".")) {
      const code = readFileSync(join(root, file), "utf8")
      const staticValueImports = code.split("\n").filter((line) => /^import\s+(?!type\b).*from\s+["']exceljs["']/.test(line))
      expect(staticValueImports, file).toEqual([])
    }
    expect(read("lib/export-xlsx.ts")).toContain('await import("exceljs")')
  })

  it("a tabela pagina, ordena e filtra no servidor e guarda visões na API, nunca no navegador", () => {
    const view = read("components/financial-view.tsx")
    expect(view).toContain('mode="server"')
    expect(view).toContain('tableKey="financial-entries"')
    for (const file of sources(".")) expect(readFileSync(join(root, file), "utf8"), file).not.toMatch(/localStorage|sessionStorage/)
  })

  it("indicadores, gráficos, tabela e exportação leem o mesmo filtro", () => {
    const view = read("components/financial-view.tsx")
    expect(view).toContain("useFinancialReport(filters)")
    expect(view).toContain("useFinancialSearch(filters, params)")
    expect(view).toContain("<ExportXlsxButton filters={filters} />")
    expect(read("queries.ts")).toMatch(/api\.financial\.export\(filters\)[\s\S]*api\.financial\.report\(filters\)/)
  })

  it("os gráficos são ocultos para leitores de tela e trazem a tabela equivalente", () => {
    for (const file of ["components/revenue-expense-chart.tsx", "components/distribution-chart.tsx"]) {
      const code = read(file)
      expect(code, file).toContain("aria-hidden")
      expect(code, file).toContain("<ChartTable")
      expect(code, file).toContain("accessibilityLayer={false}")
    }
  })

  it("nenhuma cor de gráfico é roxa: só tokens do tema", () => {
    for (const file of ["components/revenue-expense-chart.tsx", "components/distribution-chart.tsx", "lib/chart-data.ts"]) {
      const code = read(file)
      expect(code, file).not.toMatch(/purple|violet|indigo|fuchsia|#[0-9a-f]{6}\b/i)
      expect(code, file).not.toContain("var(--chart-5)")
    }
  })

  it("cada bloco tem estado de carregando e de erro com nova tentativa", () => {
    for (const file of ["components/financial-stat-tiles.tsx", "components/revenue-expense-chart.tsx", "components/distribution-chart.tsx"]) {
      const code = read(file)
      expect(code, file).toContain("<Skeleton")
      expect(code, file).toContain("<ErrorState")
      expect(code, file).toContain("onRetry")
    }
  })
})
