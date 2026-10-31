import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

function files(dir: string, ext: RegExp): string[] {
  if (!existsSync(join(ROOT, dir))) return []
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : files(path, ext)
    return ext.test(entry.name) ? [path] : []
  })
}

const sources = [...files("modules", /\.tsx?$/), ...files("shared", /\.tsx?$/)].filter((file) => !/\.test\.tsx?$/.test(file))

describe("rotas /editar e /novo", () => {
  const routes = files("app", /^page\.tsx$/).filter((file) => /[\\/](editar|novo)[\\/]page\.tsx$/.test(file))

  it("existem as rotas antigas de paciente (links e favoritos continuam valendo)", () => {
    expect(routes.sort()).toEqual([
      join("app", "(panel)", "pacientes", "[id]", "editar", "page.tsx"),
      join("app", "(panel)", "pacientes", "novo", "page.tsx"),
    ])
  })

  it("só redirecionam para a página pai com a query do dialog", () => {
    for (const route of routes) {
      const source = read(route)
      expect(source, route).toContain("redirect(")
      expect(source, route).not.toContain('"use client"')
      expect(source, route).not.toMatch(/return\s*</)
      expect(source, route).not.toMatch(/from "@\/modules/)
    }
    expect(read(join("app", "(panel)", "pacientes", "[id]", "editar", "page.tsx"))).toContain("?editar=1")
    expect(read(join("app", "(panel)", "pacientes", "novo", "page.tsx"))).toContain("/pacientes?novo=1")
  })
})

describe("criar/editar não navega para outra tela", () => {
  it("nenhum arquivo leva a um caminho /editar ou /novo (só ?novo=1 / ?editar= por query)", () => {
    const offenders = sources.filter((file) =>
      read(file)
        .split("\n")
        .some((line) => /(router\.(push|replace)|href=|redirect\()/.test(line) && /\/(editar|novo)(?:[/"'`?]|$)/.test(line))
    )
    expect(offenders).toEqual([])
  })

  it("o formulário de paciente não existe mais como tela (só como dialog)", () => {
    expect(existsSync(join(ROOT, "modules/patients/components/patient-form-views.tsx"))).toBe(false)
    expect(read("modules/patients/components/patient-form-dialog.tsx")).toContain("<FormDialog")
    expect(read("modules/patients/components/patient-form.tsx")).not.toMatch(/router\.push|useRouter|<PageHeader/)
  })
})

describe("form dialogs usam o wrapper base", () => {
  const DETAIL_AND_OTHER = new Set([
    "modules/financial/components/entry-detail-dialog.tsx",
    "modules/documents/components/document-detail-dialog.tsx",
    "modules/clinical-records/components/record-detail-dialog.tsx",
    "modules/onboarding/components/onboarding-tour.tsx",
    "modules/users/components/roles-tab.tsx",
    "shared/ui/molecules/form-dialog.tsx",
  ])

  it("nenhum formulário monta o próprio DialogContent (detalhes e tour ficam de fora)", () => {
    const offenders = sources.filter((file) => {
      const source = read(file)
      return source.includes("<DialogContent") && /<form[\s>]/.test(source) && !DETAIL_AND_OTHER.has(file)
    })
    expect(offenders).toEqual([])
  })

  it("todo arquivo de dialog com useForm usa FormDialog", () => {
    const dialogs = sources.filter((file) => /dialog\.tsx$/.test(file) && /useForm\(|useForm</.test(read(file)))
    expect(dialogs.length).toBeGreaterThanOrEqual(8)
    expect(dialogs.filter((file) => !read(file).includes("<FormDialog"))).toEqual([])
  })

  it("FormDialog confirma o descarte e bloqueia o fechamento durante o envio", () => {
    const source = read("shared/ui/molecules/form-dialog.tsx")
    expect(source).toContain("isDirty")
    expect(source).toMatch(/if \(pending\) return/)
    expect(source).toContain("Descartar")
    expect(source).toContain("<DialogBody")
    expect(source).toContain("<DialogFooter")
  })
})

describe("telas abrem criar/editar pela URL", () => {
  const LIST_AND_DETAIL = [
    "modules/patients/components/patients-list-view.tsx",
    "modules/patients/components/patient-detail-view.tsx",
    "modules/patients/components/guardians-list-view.tsx",
    "modules/catalog/components/professionals-list-view.tsx",
    "modules/catalog/components/professional-detail-view.tsx",
    "modules/catalog/components/services-view.tsx",
    "modules/catalog/components/rooms-view.tsx",
    "modules/financial/components/financial-view.tsx",
    "modules/documents/components/documents-view.tsx",
    "modules/aba/components/aba-plans-view.tsx",
    "modules/aba/components/aba-plan-detail-view.tsx",
    "modules/assessments/components/assessments-list-view.tsx",
    "modules/clinical-records/components/patient-chart-view.tsx",
    "modules/users/components/users-tab.tsx",
  ]

  it.each(LIST_AND_DETAIL)("%s usa useUrlEditor/useUrlDialog", (file) => {
    expect(read(file)).toMatch(/useUrl(Editor|Dialog)\(/)
  })

  it("o painel envolve as telas em Suspense (useSearchParams) e preserva o destino no login", () => {
    const shell = read("shared/ui/templates/panel-shell.tsx")
    expect(shell).toContain("<Suspense")
    expect(shell).toContain("loginUrl(")
    expect(read("modules/auth/components/sign-in-form.tsx")).toContain("afterLoginPath(")
  })

  it("troca de URL é replaceState (sem navegação, sem entrada no histórico)", () => {
    const hook = read("shared/lib/use-url-dialog.ts")
    expect(hook).toContain("history.replaceState")
    expect(hook).not.toMatch(/router\.(push|replace)|pushState/)
  })
})
