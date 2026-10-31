"use client"

import { Bookmark, Star, Trash2 } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { TableView } from "@/shared/api/table-preferences-mappers"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"

import { viewName } from "./lib/views"

/**
 * Visões salvas da tabela (filtros, busca, colunas, ordenação, tamanho da página), guardadas por usuário
 * no PostgreSQL: aplicar, salvar a atual (com opção de abrir sempre por ela), marcar como inicial e excluir.
 */
export function DataTableViews({
  views,
  isLoading,
  saving,
  deleting,
  onApply,
  onSave,
  onToggleInitial,
  onDelete,
  onReset,
}: {
  views: TableView[]
  isLoading: boolean
  saving: boolean
  deleting: boolean
  onApply: (view: TableView) => void
  onSave: (name: string, initial: boolean) => void
  onToggleInitial: (view: TableView) => void
  onDelete: (name: string) => void
  onReset: () => void
}) {
  const id = useId()
  const [name, setName] = useState("")
  const [initial, setInitial] = useState(false)
  const [toDelete, setToDelete] = useState<string | null>(null)
  const clean = viewName(name)
  const replacing = views.some((view) => view.name === clean)

  return (
    <>
      <Popover>
        <PopoverTrigger
          aria-label="Visões salvas"
          className="inline-flex h-(--control-h) items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30"
        >
          <Bookmark className="size-4 text-muted-foreground" aria-hidden />
          Visões
          {views.length > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{views.length}</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-2 p-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Padrão da tela
          </button>
          {isLoading ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Carregando visões…</p>
          ) : views.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Nenhuma visão salva ainda.</p>
          ) : (
            <ul className="flex max-h-56 flex-col overflow-y-auto" aria-label="Visões salvas">
              {views.map((view) => (
                <li key={view.name} className="flex items-center gap-1 rounded-md pr-1 hover:bg-muted">
                  <button type="button" onClick={() => onApply(view)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    {view.name}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={view.isDefault ? `Deixar de abrir por "${view.name}"` : `Abrir sempre por "${view.name}"`}
                    aria-pressed={view.isDefault}
                    onClick={() => onToggleInitial(view)}
                  >
                    <Star className={cn(view.isDefault && "fill-current text-primary")} aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Excluir a visão "${view.name}"`} onClick={() => setToDelete(view.name)}>
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-2 border-t pt-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!clean) return
              onSave(clean, initial)
              setName("")
            }}
          >
            <label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">
              Salvar a visão atual
            </label>
            <div className="flex gap-2">
              <Input id={`${id}-name`} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="Nome da visão" />
              <Button type="submit" size="sm" className="shrink-0 self-center" disabled={!clean || saving}>
                {replacing ? "Substituir" : "Salvar"}
              </Button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={initial} onCheckedChange={(checked) => setInitial(checked === true)} />
              Abrir sempre por esta visão
            </label>
          </form>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Excluir a visão "${toDelete ?? ""}"?`}
        description="A visão deixa de existir para você. Os dados da tabela não mudam."
        confirmLabel="Excluir"
        destructive
        pending={deleting}
        onConfirm={() => {
          if (toDelete) onDelete(toDelete)
          setToDelete(null)
        }}
      />
    </>
  )
}
