import { Copy, Pencil, Trash2 } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import type { Permission } from "@/domain/permissions"

import { buildMenu, confirmOf, copiedMessage, countItems, DANGER_GROUP, intentOf, type EntityAction, type ItemNode, type MenuNode } from "../lib/build-menu"
import { copyText } from "../lib/clipboard"

const noop = () => undefined
const everyone = () => true
const only = (...granted: Permission[]) => (permission: Permission) => granted.includes(permission)
const ids = (nodes: MenuNode[]) => nodes.map((node) => node.id)
const items = (nodes: MenuNode[]) => nodes.filter((node): node is ItemNode => node.type === "item")

describe("buildMenu", () => {
  it("mantém a ordem e separa grupos diferentes, sem separador no início nem no fim", () => {
    const actions: EntityAction[] = [
      { id: "view", label: "Ver detalhes", onSelect: noop },
      { id: "edit", label: "Editar", icon: Pencil, onSelect: noop },
      { id: "copy", label: "Copiar ID", kind: "copy", text: "x", group: "clipboard" },
    ]
    expect(ids(buildMenu(actions, everyone))).toEqual(["view", "edit", "separator-1", "copy"])
    expect(ids(buildMenu([actions[2]], everyone))).toEqual(["copy"])
  })

  it("agrupa itens do mesmo grupo mesmo quando não estão juntos na lista", () => {
    const actions: EntityAction[] = [
      { id: "a", label: "A", onSelect: noop, group: "one" },
      { id: "b", label: "B", onSelect: noop, group: "two" },
      { id: "c", label: "C", onSelect: noop, group: "one" },
    ]
    expect(ids(buildMenu(actions, everyone))).toEqual(["a", "c", "separator-1", "b"])
  })

  it("ação sem permissão some do menu; qualquer permissão da lista libera", () => {
    const actions: EntityAction[] = [
      { id: "view", label: "Ver", onSelect: noop },
      { id: "edit", label: "Editar", onSelect: noop, permission: "finance:write" },
      { id: "either", label: "Qualquer", onSelect: noop, permission: ["finance:write", "finance:read"] },
    ]
    expect(ids(buildMenu(actions, only()))).toEqual(["view"])
    expect(ids(buildMenu(actions, only("finance:read")))).toEqual(["view", "either"])
    expect(ids(buildMenu(actions, only("finance:write")))).toEqual(["view", "edit", "either"])
  })

  it("hidden esconde por regra de negócio e disabled mantém o item com o motivo", () => {
    const actions: EntityAction[] = [
      { id: "pay", label: "Registrar pagamento", onSelect: noop, hidden: true },
      { id: "cancel", label: "Cancelar", onSelect: noop, disabled: "Há pagamentos ativos." },
      { id: "plain", label: "Editar", onSelect: noop, disabled: true },
    ]
    const [cancel, plain] = items(buildMenu(actions, everyone))
    expect(cancel).toMatchObject({ id: "cancel", disabled: true, disabledReason: "Há pagamentos ativos." })
    expect(plain).toMatchObject({ id: "plain", disabled: true, disabledReason: undefined })
    expect(ids(buildMenu(actions, everyone))).not.toContain("pay")
  })

  it("ação destrutiva vai para o fim, em grupo próprio, mesmo declarada antes", () => {
    const actions: EntityAction[] = [
      { id: "cancel", label: "Cancelar lançamento", icon: Trash2, destructive: true, confirm: { title: "Cancelar?" }, onSelect: noop },
      { id: "edit", label: "Editar", onSelect: noop },
    ]
    const nodes = buildMenu(actions, everyone)
    expect(ids(nodes)).toEqual(["edit", "separator-1", "cancel"])
    expect(items(nodes)[1]).toMatchObject({ id: "cancel", destructive: true })
    expect(DANGER_GROUP).toBe("danger")
  })

  it("monta submenus (ex.: situação) e descarta o submenu quando nada dentro é permitido", () => {
    const actions: EntityAction[] = [
      {
        id: "status",
        label: "Alterar situação",
        kind: "submenu",
        items: [
          { id: "confirm", label: "Confirmar", onSelect: noop, permission: "appointments:write" },
          { id: "cancel", label: "Cancelar", onSelect: noop, permission: "appointments:cancel" },
        ],
      },
    ]
    const full = buildMenu(actions, everyone)
    expect(full).toHaveLength(1)
    expect(full[0]).toMatchObject({ type: "submenu", id: "status" })
    expect(full[0].type === "submenu" && ids(full[0].items)).toEqual(["confirm", "cancel"])

    const partial = buildMenu(actions, only("appointments:cancel"))
    expect(partial[0].type === "submenu" && ids(partial[0].items)).toEqual(["cancel"])
    expect(buildMenu(actions, only())).toEqual([])
    expect(countItems(full)).toBe(2)
  })
})

describe("seleção de itens", () => {
  const node = (action: EntityAction) => items(buildMenu([action], everyone))[0]

  it("copiar nunca confirma; destrutiva sempre confirma; comum executa direto", () => {
    expect(intentOf(node({ id: "c", label: "Copiar código", icon: Copy, kind: "copy", text: "LAN-0001" }))).toBe("copy")
    expect(intentOf(node({ id: "d", label: "Excluir", destructive: true, confirm: { title: "Excluir?" }, onSelect: noop }))).toBe("confirm")
    expect(intentOf(node({ id: "e", label: "Editar", onSelect: noop }))).toBe("run")
  })

  it("ação comum pode pedir confirmação (ex.: arquivar) sem ser destrutiva", () => {
    const archive = node({ id: "a", label: "Arquivar", confirm: { title: "Arquivar?", confirmLabel: "Arquivar" }, onSelect: noop })
    expect(intentOf(archive)).toBe("confirm")
    expect(archive.destructive).toBe(false)
    expect(confirmOf(archive)).toEqual({ title: "Arquivar?", confirmLabel: "Arquivar" })
  })

  it("destrutiva sem texto próprio recebe um padrão seguro; copiar não tem confirmação", () => {
    const loose = { id: "d", label: "Remover vínculo", destructive: true, onSelect: noop } as unknown as EntityAction
    expect(confirmOf(node(loose))).toEqual({ title: "Remover vínculo?", confirmLabel: "Remover vínculo" })
    expect(() => confirmOf(node({ id: "c", label: "Copiar ID", kind: "copy", text: "1" }))).toThrow()
  })

  it("o motivo do ConfirmDialog chega ao onSelect", async () => {
    const onSelect = vi.fn()
    const cancel = node({ id: "x", label: "Cancelar", destructive: true, confirm: { title: "Cancelar?", reason: { label: "Motivo", required: true } }, onSelect })
    expect(confirmOf(cancel).reason).toEqual({ label: "Motivo", required: true })
    if (cancel.action.kind !== "copy") await cancel.action.onSelect("Pedido do paciente")
    expect(onSelect).toHaveBeenCalledWith("Pedido do paciente")
  })

  it("mensagem do toast de copiar vem do rótulo ou da mensagem própria", () => {
    expect(copiedMessage({ id: "c", label: "Copiar código", kind: "copy", text: "x" })).toBe("Código copiado.")
    expect(copiedMessage({ id: "c", label: "Copiar valor", kind: "copy", text: "x" })).toBe("Valor copiado.")
    expect(copiedMessage({ id: "c", label: "Copiar ID", kind: "copy", text: "x", successMessage: "ID copiado." })).toBe("ID copiado.")
  })
})

describe("copyText", () => {
  it("usa a API de área de transferência quando existe", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await expect(copyText("PAC-0007", { navigator: { clipboard: { writeText } } })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("PAC-0007")
  })

  it("sem a API (ou com permissão negada), cai no execCommand e limpa o campo temporário", async () => {
    const field = { value: "", style: {} as Record<string, string>, setAttribute: vi.fn(), select: vi.fn() }
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    const execCommand = vi.fn().mockReturnValue(true)
    const document = { createElement: () => field as unknown as HTMLTextAreaElement, body: { appendChild, removeChild }, execCommand }
    const denied = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } }

    await expect(copyText("R$ 100,00", { navigator: denied, document })).resolves.toBe(true)
    expect(field.value).toBe("R$ 100,00")
    expect(execCommand).toHaveBeenCalledWith("copy")
    expect(removeChild).toHaveBeenCalledWith(field)
    await expect(copyText("x", { document })).resolves.toBe(true)
  })

  it("devolve false quando nenhum método está disponível ou o comando falha", async () => {
    await expect(copyText("x", {})).resolves.toBe(false)
    const field = { value: "", style: {} as Record<string, string>, setAttribute: vi.fn(), select: vi.fn() }
    const document = {
      createElement: () => field as unknown as HTMLTextAreaElement,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: () => {
        throw new Error("blocked")
      },
    }
    await expect(copyText("x", { document })).resolves.toBe(false)
  })
})
