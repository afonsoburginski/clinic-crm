"use client"

import { CircleHelp, TriangleAlert } from "lucide-react"
import { useEffect, useId, useState } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive,
  reason,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  /** Exige um texto de motivo antes de confirmar. */
  reason?: { label: string; required?: boolean }
  pending?: boolean
  onConfirm: (reason?: string) => void
}) {
  const [text, setText] = useState("")
  const reasonId = useId()
  // O pai pode fechar o diálogo direto (ex.: mutation otimista): o motivo digitado não pode sobrar na próxima abertura.
  useEffect(() => {
    if (!open) setText("")
  }, [open])
  const blocked = !!reason?.required && text.trim().length < 3

  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia tone={destructive ? "danger" : "neutral"}>
            {destructive ? <TriangleAlert aria-hidden /> : <CircleHelp aria-hidden />}
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {reason && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>{reason.label}</Label>
            <Textarea id={reasonId} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={blocked || pending}
            onClick={() => onConfirm(reason ? text.trim() : undefined)}
          >
            {pending ? "Salvando…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
