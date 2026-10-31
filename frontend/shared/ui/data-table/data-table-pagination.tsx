"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { pageWindow, parsePageInput } from "./lib/pagination"
import { PAGE_SIZES } from "./lib/types"

/** Rodapé: "Mostrando X–Y de Z", tamanho da página, primeira/anterior/próxima/última e "ir para a página N". */
export function DataTablePagination({
  pageIndex,
  pageSize,
  pageCount,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = PAGE_SIZES,
  noun = ["resultado", "resultados"],
}: {
  pageIndex: number
  pageSize: number
  pageCount: number
  total: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizes?: readonly number[]
  noun?: [string, string]
}) {
  const { from, to } = pageWindow(pageIndex, pageSize, total)
  const id = useId()
  const [goTo, setGoTo] = useState(String(pageIndex + 1))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    setGoTo(String(pageIndex + 1))
    setInvalid(false)
  }, [pageIndex])

  function submitGoTo() {
    const next = parsePageInput(goTo, pageCount)
    if (next === null) return setInvalid(true)
    setInvalid(false)
    onPageChange(next)
    setGoTo(String(next + 1))
  }

  const first = pageIndex <= 0
  const last = pageIndex >= pageCount - 1

  return (
    <nav aria-label="Paginação" className="flex flex-col gap-3 border-t px-5 py-3 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
      <p role="status" aria-live="polite" className="tabular-nums">
        {total === 0 ? `Nenhum ${noun[0]}` : `Mostrando ${from}–${to} de ${total} ${total === 1 ? noun[0] : noun[1]}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span id={`${id}-size`}>Linhas por página</span>
          <SimpleSelect
            ariaLabel="Linhas por página"
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            options={pageSizes.map((size) => ({ value: String(size), label: String(size) }))}
            className="h-(--control-h-sm) w-20"
          />
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submitGoTo()
          }}
        >
          <label htmlFor={`${id}-goto`}>Ir para</label>
          <Input
            id={`${id}-goto`}
            inputMode="numeric"
            value={goTo}
            onChange={(event) => setGoTo(event.target.value)}
            onBlur={() => goTo !== String(pageIndex + 1) && submitGoTo()}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-goto-error` : undefined}
            className="h-(--control-h-sm) w-14 px-2 text-center tabular-nums"
          />
          <span className="tabular-nums">de {pageCount}</span>
          {invalid && (
            <span id={`${id}-goto-error`} role="alert" className="text-destructive">
              Página inválida
            </span>
          )}
        </form>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Primeira página" disabled={first} onClick={() => onPageChange(0)}>
            <ChevronsLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Página anterior" disabled={first} onClick={() => onPageChange(pageIndex - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Próxima página" disabled={last} onClick={() => onPageChange(pageIndex + 1)}>
            <ChevronRight aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Última página" disabled={last} onClick={() => onPageChange(pageCount - 1)}>
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  )
}
