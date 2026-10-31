"use client"

import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ColumnMenuItem {
  id: string
  label: string
  visible: boolean
  /** Colunas fixas (`alwaysVisible`) aparecem marcadas e travadas. */
  locked: boolean
}

/** Menu "Colunas": mostrar/ocultar, mover para cima/baixo e restaurar o padrão da tela. */
export function DataTableColumnsMenu({
  items,
  onToggle,
  onMove,
  onReset,
}: {
  items: ColumnMenuItem[]
  onToggle: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onReset: () => void
}) {
  const hidden = items.filter((item) => !item.visible).length
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Escolher colunas"
        className="inline-flex h-(--control-h) items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30"
      >
        <Columns3 className="size-4 text-muted-foreground" aria-hidden />
        Colunas
        {hidden > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{items.length - hidden}/{items.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-1.5">
        <ul className="flex max-h-72 flex-col overflow-y-auto" aria-label="Colunas da tabela">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-1 rounded-md pr-1 hover:bg-muted">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm">
                <Checkbox checked={item.visible} disabled={item.locked} onCheckedChange={() => onToggle(item.id)} />
                <span className="truncate">{item.label}</span>
              </label>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Mover ${item.label} para cima`} disabled={index === 0} onClick={() => onMove(item.id, -1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Mover ${item.label} para baixo`} disabled={index === items.length - 1} onClick={() => onMove(item.id, 1)}>
                <ArrowDown aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className="self-end" onClick={onReset}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          Restaurar padrão
        </Button>
      </PopoverContent>
    </Popover>
  )
}
