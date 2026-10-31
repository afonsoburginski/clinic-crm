"use client"

import { PencilLine } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { clinicDateKey } from "@/domain/clinic-time"
import { activePayments, KIND_LABELS, METHOD_LABELS } from "@/domain/financial"
import { PAYMENT_METHODS } from "@/domain/schemas"
import type { FinancialPayment, PaymentMethod } from "@/domain/types"
import { useCan } from "@/shared/lib/current-user"
import { formatBirthDate, formatCurrency, formatDateTime } from "@/shared/lib/format"
import { useLookups } from "@/shared/lib/lookups"
import { ConfirmDialog } from "@/shared/ui/molecules/confirm-dialog"
import { DialogErrorState, DialogLoadingState } from "@/shared/ui/molecules/dialog-states"
import { FormField } from "@/shared/ui/molecules/form-field"
import { SimpleSelect } from "@/shared/ui/molecules/simple-select"

import { useCancelEntry, useFinancialEntry, useRegisterPayment, useReversePayment } from "../queries"
import { competenceLabel, EntryStatusPill } from "./entry-status-pill"

const METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }))
const newRequestId = () => `req-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export function EntryDetailDialog({ entryId, onClose, onEdit }: { entryId: string; onClose: () => void; onEdit: () => void }) {
  const { data, error } = useFinancialEntry(entryId)
  const { patient } = useLookups()
  const canWrite = useCan("finance:write")
  const [cancelling, setCancelling] = useState(false)
  const [reversing, setReversing] = useState<FinancialPayment | null>(null)
  const cancel = useCancelEntry(entryId)
  const reverse = useReversePayment()

  const entry = data?.entry
  const hasActivePayments = !!data && activePayments(data.payments).length > 0
  const cancelled = data?.status === "cancelled"

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="2xl">
        {error ? (
          <DialogErrorState title="Lançamento" error={error} />
        ) : !data || !entry ? (
          <DialogLoadingState title="Lançamento" />
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{entry.description}</DialogTitle>
                <EntryStatusPill status={data.status} />
              </div>
              <DialogDescription>
                <span className="font-mono">{entry.code}</span> · {KIND_LABELS[entry.kind]} · {entry.category}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Info label="Valor">{formatCurrency(entry.amountCents)}</Info>
              <Info label={entry.kind === "income" ? "Recebido" : "Pago"}>{formatCurrency(data.paidCents)}</Info>
              <Info label="Saldo em aberto">{formatCurrency(data.balanceCents)}</Info>
              <Info label="Competência">{competenceLabel(entry.competence)}</Info>
              <Info label="Vencimento">{formatBirthDate(entry.dueDate)}</Info>
              <Info label="Contraparte">{entry.counterparty}</Info>
              {entry.patientId && <Info label="Paciente">{patient.get(entry.patientId)?.fullName ?? "—"}</Info>}
            </dl>

            {cancelled && entry.cancelReason && (
              <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Lançamento cancelado</span>
                {entry.cancelledAt && <> em {formatDateTime(entry.cancelledAt)}</>}: {entry.cancelReason}. O registro permanece para consulta.
              </p>
            )}

            <section aria-label="Pagamentos" className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pagamentos</h3>
              {data.payments.length ? (
                <ul className="flex flex-col gap-1.5">
                  {data.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <div className="flex flex-col">
                        <span className={p.reversedAt ? "text-muted-foreground line-through" : "font-medium"}>
                          {formatCurrency(p.amountCents)} · {METHOD_LABELS[p.method]} · {formatBirthDate(p.paidAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Registrado por {p.registeredByName}
                          {p.reversedAt && <> · Estornado em {formatDateTime(p.reversedAt)}: {p.reverseReason}</>}
                        </span>
                      </div>
                      {canWrite && !p.reversedAt && !cancelled && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setReversing(p)}>
                          Estornar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
              )}
            </section>

            {canWrite && !cancelled && data.balanceCents > 0 && <PaymentForm entryId={entry.id} balanceCents={data.balanceCents} />}

            {canWrite && !cancelled && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="outline" onClick={onEdit}>
                  <PencilLine aria-hidden />
                  Editar lançamento
                </Button>
                <Button variant="outline" className="text-destructive hover:text-destructive" disabled={hasActivePayments} onClick={() => setCancelling(true)}>
                  Cancelar lançamento
                </Button>
                {hasActivePayments && <span className="text-xs text-muted-foreground">Estorne os pagamentos antes de cancelar.</span>}
              </div>
            )}

            <ConfirmDialog
              open={cancelling}
              onOpenChange={setCancelling}
              title="Cancelar lançamento?"
              description="O lançamento permanece no histórico, marcado como cancelado, e deixa de contar nos resumos. Não há exclusão."
              confirmLabel="Cancelar lançamento"
              destructive
              reason={{ label: "Motivo do cancelamento (mínimo 5 caracteres)", required: true }}
              pending={cancel.isPending}
              onConfirm={(reason) => cancel.mutate({ reason: reason ?? "" }, { onSuccess: () => setCancelling(false) })}
            />
            <ConfirmDialog
              open={!!reversing}
              onOpenChange={(open) => !open && setReversing(null)}
              title="Estornar pagamento?"
              description={reversing && `${formatCurrency(reversing.amountCents)} voltam ao saldo em aberto. O pagamento fica preservado, marcado como estornado.`}
              confirmLabel="Estornar"
              destructive
              reason={{ label: "Motivo do estorno (mínimo 5 caracteres)", required: true }}
              pending={reverse.isPending}
              onConfirm={(reason) =>
                reversing && reverse.mutate({ paymentId: reversing.id, input: { reason: reason ?? "" } }, { onSuccess: () => setReversing(null) })
              }
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

/** Baixa parcial permitida até o saldo (RN-FIN-003); `requestId` evita baixa em duplicidade (RN-FIN-004). */
function PaymentForm({ entryId, balanceCents }: { entryId: string; balanceCents: number }) {
  const register = useRegisterPayment(entryId)
  const [amount, setAmount] = useState("")
  const [paidAt, setPaidAt] = useState(() => clinicDateKey(new Date()))
  const [method, setMethod] = useState<PaymentMethod>("pix")
  const [requestId, setRequestId] = useState(newRequestId)

  const submit = () =>
    register.mutate(
      { amount: amount.trim() === "" ? Number.NaN : Number(amount.replace(",", ".")), paidAt, method, requestId },
      {
        onSuccess: () => {
          setAmount("")
          setRequestId(newRequestId())
        },
      }
    )

  return (
    <form
      noValidate
      aria-label="Registrar pagamento"
      className="flex flex-col gap-3 rounded-xl border bg-card/60 p-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h3 className="text-sm font-medium">Registrar pagamento</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="payment-amount" label="Valor (R$)" hint={`Saldo: ${formatCurrency(balanceCents)}. Parcial é permitido.`}>
          <Input id="payment-amount" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField id="payment-date" label="Data do pagamento">
          <Input id="payment-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </FormField>
        <FormField id="payment-method" label="Forma">
          <SimpleSelect id="payment-method" value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={METHOD_OPTIONS} />
        </FormField>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? "Registrando…" : "Registrar pagamento"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAmount((balanceCents / 100).toFixed(2))}>
          Quitar saldo
        </Button>
      </div>
    </form>
  )
}
