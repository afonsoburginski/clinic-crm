import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  ALERT_DIALOG_MAX_HEIGHT,
  ALERT_DIALOG_SIZES,
  DIALOG_MAX_HEIGHT,
  DIALOG_MAX_HEIGHT_MOBILE,
  DIALOG_MIN_HEIGHTS,
  DIALOG_MIN_WIDTH,
  DIALOG_SIZE_CLASSES,
  DIALOG_SIZE_NAMES,
  DIALOG_WIDTHS,
  SHEET_MAX_HEIGHT,
  SHEET_SIZE_NAMES,
  SHEET_WIDTHS,
} from "@/components/ui/dialog-sizes"
import { LAYER_LEVELS, LAYERS } from "@/components/ui/layers"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path)
    return entry.name.endsWith(".tsx") ? [path] : []
  })
}

const pxOf = (width: string) => Number(/min\(92vw,(\d+)px\)/.exec(width)?.[1])

describe("tamanhos de dialog", () => {
  it("expõe as variantes sm, md, lg e xl", () => {
    expect([...DIALOG_SIZE_NAMES]).toEqual(["sm", "md", "lg", "xl"])
    for (const name of DIALOG_SIZE_NAMES) {
      expect(DIALOG_WIDTHS[name]).toBeDefined()
      expect(DIALOG_SIZE_CLASSES[name]).toContain(DIALOG_WIDTHS[name])
    }
  })

  it("toda largura é min(92vw, X) e cresce de uma variante para a seguinte", () => {
    const px = DIALOG_SIZE_NAMES.map((name) => {
      expect(DIALOG_WIDTHS[name]).toMatch(/^sm:w-\[min\(92vw,\d+px\)\]$/)
      return pxOf(DIALOG_WIDTHS[name])
    })
    expect(px).toEqual([480, 720, 960, 1100])
  })

  it("tem piso de largura que cabe em 92vw e altura máxima de 90dvh", () => {
    expect(DIALOG_MIN_WIDTH).toMatch(/min-w-\[min\(92vw,/)
    expect(DIALOG_MAX_HEIGHT).toMatch(/max-h-\[90(dvh|vh)\]/)
    expect(DIALOG_MAX_HEIGHT_MOBILE).toMatch(/max-h-\[calc\(100dvh-/)
    expect(Object.keys(DIALOG_MIN_HEIGHTS).sort()).toEqual([...DIALOG_SIZE_NAMES].sort())
  })

  it("alertdialog usa largura min(92vw, X) e altura máxima de 90dvh", () => {
    for (const width of Object.values(ALERT_DIALOG_SIZES)) expect(width).toMatch(/^w-\[min\(92vw,/)
    expect(pxOf(ALERT_DIALOG_SIZES.default)).toBe(pxOf(DIALOG_WIDTHS.sm))
    expect(ALERT_DIALOG_MAX_HEIGHT).toMatch(/max-h-\[90(dvh|vh)\]/)
  })

  it("sheets têm nav, sm, md e lg, sempre limitados a 92vw, e painéis de borda a 90dvh", () => {
    expect([...SHEET_SIZE_NAMES]).toEqual(["nav", "sm", "md", "lg"])
    for (const name of SHEET_SIZE_NAMES) {
      const widths = SHEET_WIDTHS[name].match(/w-\[min\(92vw,[^)]+\)\]/g) ?? []
      expect(widths).toHaveLength(2)
    }
    expect(SHEET_MAX_HEIGHT).toContain("data-[side=bottom]:max-h-[90dvh]")
    expect(SHEET_MAX_HEIGHT).toContain("data-[side=top]:max-h-[90dvh]")
  })
})

describe("escala de camadas", () => {
  it("popovers abrem acima de dialogs e tooltips acima de popovers", () => {
    expect(LAYER_LEVELS.dialog).toBeLessThan(LAYER_LEVELS.popover)
    expect(LAYER_LEVELS.popover).toBeLessThan(LAYER_LEVELS.tooltip)
    for (const key of Object.keys(LAYERS) as (keyof typeof LAYERS)[]) {
      expect(LAYERS[key]).toBe(`z-${LAYER_LEVELS[key]}`)
    }
  })

  it("popover, select, dropdown e tooltip usam a escala, sem z-50 fixo", () => {
    for (const name of ["popover", "select", "dropdown-menu", "tooltip"]) {
      const source = read(`components/ui/${name}.tsx`)
      expect(source, name).toContain("LAYERS.")
      expect(source, name).not.toMatch(/\bz-50\b/)
    }
  })

  it("dialog, alertdialog, sheet e command usam a camada de dialog", () => {
    for (const name of ["dialog", "alert-dialog", "sheet", "command"]) {
      const source = read(`components/ui/${name}.tsx`)
      expect(source, name).toContain("LAYERS.dialog")
      expect(source, name).not.toMatch(/\bz-50\b/)
    }
  })
})

describe("uso do componente base", () => {
  const files = [...sourceFiles("modules"), ...sourceFiles("shared")]
  const withContent = (tag: string) => files.filter((file) => read(file).includes(`<${tag}`))

  it("encontra dialogs, sheets e alertdialogs para varrer", () => {
    expect(withContent("DialogContent").length).toBeGreaterThanOrEqual(15)
    expect(withContent("SheetContent").length).toBeGreaterThanOrEqual(2)
    expect(withContent("AlertDialogContent")).toEqual([join("shared", "ui", "molecules", "confirm-dialog.tsx")])
  })

  it("todo DialogContent usa DialogBody para o corpo rolável", () => {
    const missing = withContent("DialogContent").filter((file) => !read(file).includes("<DialogBody"))
    expect(missing.map((file) => relative(ROOT, join(ROOT, file)))).toEqual([])
  })

  it("todo SheetContent usa SheetBody", () => {
    const missing = withContent("SheetContent").filter((file) => !read(file).includes("<SheetBody"))
    expect(missing).toEqual([])
  })

  it("nenhum dialog, sheet ou alertdialog define largura ad hoc", () => {
    const adhoc = /<(?:Dialog|Sheet|AlertDialog)Content[^>]*className="[^"]*(?:\bmax-w-|\bw-|\bmin-w-|\bmax-h-|\bh-)/
    const offenders = files.filter((file) => adhoc.test(read(file)))
    expect(offenders).toEqual([])
  })

  it("DialogContent sempre escolhe uma variante declarada", () => {
    const sizes = new Set<string>(DIALOG_SIZE_NAMES)
    for (const file of withContent("DialogContent")) {
      for (const match of read(file).matchAll(/<DialogContent size="([^"]+)"/g)) {
        expect(sizes.has(match[1]), `${file}: ${match[1]}`).toBe(true)
      }
    }
  })
})
