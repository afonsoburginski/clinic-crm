import { describe, expect, it, vi } from "vitest"

import type { FinancialEntry, FinancialEntryStatus } from "@/domain/types"
import { itemFor, userWith, visibleIds } from "@/shared/ui/entity-menu/testing"

import { financialActions } from "../financial-actions"

const entry: FinancialEntry = {
  id: "e-1",
  code: "LAN-0001",
  kind: "income",
  description: "Consulta",
  category: "Atendimento",
  competence: "2026-10",
  dueDate: "2026-10-20",
  amountCents: 10_000,
  createdBy: "u",
  createdAt: "",
  updatedAt: "",
}
const row = (status: FinancialEntryStatus, paidCents = 0, kind: FinancialEntry["kind"] = "income") => ({
  entry: { ...entry, kind },
  status,
  paidCents,
  balanceCents: status === "paid" || status === "cancelled" ? 0 : entry.amountCents - paidCents,
})
const handlers = () => ({ onView: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onPay: vi.fn(), onCancel: vi.fn() })
const finance = userWith(["finance"])
const admin = userWith(["admin"])

describe("FIN — ações do lançamento (menu ⋯ e clique direito)", () => {
  it("lançamento aberto oferece ver, editar, duplicar, pagar e cancelar; cancelar é destrutivo e pede motivo", () => {
    const actions = financialActions(row("open"), handlers())
    expect(visibleIds(actions, finance)).toEqual(["view", "edit", "duplicate", "copy-code", "copy-amount", "copy-id", "pay", "cancel"])
    const cancel = itemFor(actions, finance, "cancel")
    expect(cancel).toMatchObject({ destructive: true, disabled: false })
    expect(cancel?.action.kind !== "copy" && cancel?.action.confirm?.reason).toEqual({ label: "Motivo do cancelamento (mínimo 5 caracteres)", required: true })
  })

  it("lançamento cancelado não oferece pagamento, edição, estorno nem novo cancelamento", () => {
    const ids = visibleIds(financialActions(row("cancelled"), handlers()), finance)
    expect(ids).toEqual(["view", "duplicate", "copy-code", "copy-amount", "copy-id"])
  })

  it("lançamento quitado não oferece pagamento, mas oferece estorno; cancelar fica desabilitado até estornar", () => {
    const actions = financialActions(row("paid", 10_000), handlers())
    const ids = visibleIds(actions, finance)
    expect(ids).not.toContain("pay")
    expect(ids).toContain("reverse")
    expect(itemFor(actions, finance, "cancel")).toMatchObject({ disabled: true, disabledReason: "Estorne os pagamentos antes de cancelar." })
  })

  it("pagamento parcial ainda aceita novo pagamento; o rótulo segue o tipo (recebimento × pagamento)", () => {
    expect(itemFor(financialActions(row("partial", 4_000), handlers()), finance, "pay")?.label).toBe("Registrar recebimento")
    expect(itemFor(financialActions(row("overdue", 0, "expense"), handlers()), finance, "pay")?.label).toBe("Registrar pagamento")
  })

  it("perfil sem finance:write (administrador, só leitura) não vê nenhuma ação de escrita", () => {
    const ids = visibleIds(financialActions(row("open"), handlers()), admin)
    expect(ids).toEqual(["view", "copy-code", "copy-amount", "copy-id"])
  })

  it("copiar valor e código levam o texto formatado em pt-BR e o código do lançamento", () => {
    const actions = financialActions(row("open"), handlers())
    const amount = itemFor(actions, finance, "copy-amount")?.action
    const code = itemFor(actions, finance, "copy-code")?.action
    expect(amount?.kind === "copy" && amount.text.replace(/\s/g, " ")).toBe("R$ 100,00")
    expect(code?.kind === "copy" && code.text).toBe("LAN-0001")
  })

  it("cada ação chama o callback certo (cancelar leva o motivo)", async () => {
    const h = handlers()
    const actions = financialActions(row("open"), h)
    for (const id of ["view", "edit", "duplicate", "pay"]) {
      const node = itemFor(actions, finance, id)
      if (node?.action.kind !== "copy") await node?.action.onSelect()
    }
    const cancel = itemFor(actions, finance, "cancel")
    if (cancel?.action.kind !== "copy") await cancel?.action.onSelect("Lançamento duplicado")
    expect(h.onView).toHaveBeenCalledTimes(1)
    expect(h.onEdit).toHaveBeenCalledTimes(1)
    expect(h.onDuplicate).toHaveBeenCalledTimes(1)
    expect(h.onPay).toHaveBeenCalledTimes(1)
    expect(h.onCancel).toHaveBeenCalledWith("Lançamento duplicado")
  })
})
