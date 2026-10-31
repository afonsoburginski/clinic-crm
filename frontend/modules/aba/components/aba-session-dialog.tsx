"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { clinicDateKey } from "@/domain/clinic-time"
import type { AbaPlan } from "@/domain/types"
import { FormDialog } from "@/shared/ui/molecules/form-dialog"
import { FormField } from "@/shared/ui/molecules/form-field"

import { useRecordSession } from "../queries"

interface Row {
  trials: string
  correct: string
  note: string
}

const EMPTY: Row = { trials: "", correct: "", note: "" }

/** Só registra o que foi medido: objetivos sem tentativas informadas ficam de fora (RN-ABA-004). */
export function AbaSessionDialog({ plan, onClose }: { plan: AbaPlan; onClose: () => void }) {
  const record = useRecordSession()
  const goals = plan.goals.filter((g) => g.status === "active")
  const [date, setDate] = useState(() => clinicDateKey(new Date()))
  const [notes, setNotes] = useState("")
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [error, setError] = useState<string>()

  const patch = (goalId: string, change: Partial<Row>) => setRows((prev) => ({ ...prev, [goalId]: { ...EMPTY, ...prev[goalId], ...change } }))

  const submit = () => {
    const measures = goals
      .filter((g) => (rows[g.id]?.trials ?? "") !== "")
      .map((g) => {
        const row = rows[g.id]
        return {
          goalId: g.id,
          trials: Number(row.trials),
          correct: row.correct === "" ? Number.NaN : Number(row.correct),
          note: row.note,
        }
      })
    if (!measures.length) {
      setError("Informe tentativas e acertos de ao menos um objetivo.")
      return
    }
    setError(undefined)
    record.mutate({ planId: plan.id, date, notes, measures }, { onSuccess: onClose })
  }

  return (
    <FormDialog
      size="md"
      title="Registrar sessão"
      description="Informe tentativas e acertos observados. O progresso é calculado só com o que for registrado aqui."
      formId="aba-session-form"
      submitLabel="Registrar sessão"
      pending={record.isPending}
      isDirty={notes !== "" || Object.values(rows).some((r) => r.trials !== "" || r.correct !== "" || r.note !== "")}
      onClose={onClose}
    >
      <form
        id="aba-session-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <FormField id="session-date" label="Data da sessão" required className="sm:max-w-48">
          <Input id="session-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>

        <ul className="flex flex-col gap-3">
          {goals.map((g) => {
            const row = rows[g.id] ?? EMPTY
            return (
              <li key={g.id} className="flex flex-col gap-2 rounded-xl border bg-card/60 p-3.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{g.title}</span>
                  <span className="text-xs text-muted-foreground">
                    Critério: {g.criterionText} · meta {g.targetPercent}% em {g.consecutiveSessions} sess{g.consecutiveSessions === 1 ? "ão" : "ões"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-[8rem_8rem_1fr]">
                  <FormField id={`trials-${g.id}`} label="Tentativas">
                    <Input id={`trials-${g.id}`} type="number" inputMode="numeric" min={1} value={row.trials} onChange={(e) => patch(g.id, { trials: e.target.value })} />
                  </FormField>
                  <FormField id={`correct-${g.id}`} label="Acertos">
                    <Input id={`correct-${g.id}`} type="number" inputMode="numeric" min={0} value={row.correct} onChange={(e) => patch(g.id, { correct: e.target.value })} />
                  </FormField>
                  <FormField id={`note-${g.id}`} label="Observação">
                    <Input id={`note-${g.id}`} value={row.note} onChange={(e) => patch(g.id, { note: e.target.value })} />
                  </FormField>
                </div>
              </li>
            )
          })}
        </ul>

        <FormField id="session-notes" label="Notas da sessão">
          <Textarea id="session-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </FormDialog>
  )
}
