import { describe, expect, it } from "vitest"

import {
  canReadClinical,
  canWriteClinical,
  currentFinalized,
  editDraft,
  finalizeDraft,
  newDraft,
  startRectification,
  versionChain,
} from "../clinical-record"
import { ForbiddenError, ValidationError } from "../errors"
import type { ClinicalRecord, Role, User } from "../types"

const user = (roles: Role[], id = "u1", professionalId?: string): User => ({
  id,
  name: `Usuário ${id}`,
  email: `${id}@t.com`,
  title: "",
  roles,
  professionalId,
})

const author = user(["professional"], "u-autor", "p1")
const other = user(["professional"], "u-outro", "p2")
const T0 = "2026-01-10T10:00:00.000Z"
const T1 = "2026-01-11T10:00:00.000Z"
const T2 = "2026-01-12T10:00:00.000Z"
const LONG = "Paciente colaborativo, relata melhora na comunicação durante a sessão."

const draft = (): ClinicalRecord =>
  newDraft({ id: "r1", patientId: "pa-1", kind: "evolution", title: "Evolução 10/01", content: LONG }, author, T0)

describe("PRN — acesso (RN-PRN-001/002)", () => {
  it("profissional lê e escreve apenas em paciente próprio", () => {
    expect(canReadClinical(author, true)).toBe(true)
    expect(canWriteClinical(author, true)).toBe(true)
    expect(canReadClinical(author, false)).toBe(false)
    expect(canWriteClinical(author, false)).toBe(false)
  })

  it.each<Role>(["reception", "finance", "admin", "manager"])("%s nunca acessa prontuário (CA-PRN-001)", (role) => {
    const u = user([role], "x")
    expect(canReadClinical(u, true)).toBe(false)
    expect(canWriteClinical(u, true)).toBe(false)
  })

  it("gestor que também é profissional acessa só pelo papel profissional", () => {
    const both = user(["professional", "manager"], "u-both", "p3")
    expect(canReadClinical(both, true)).toBe(true)
    expect(canReadClinical(both, false)).toBe(false)
  })

  it("sem usuário, nada é permitido", () => {
    expect(canReadClinical(null, true)).toBe(false)
  })
})

describe("PRN — rascunho e finalização (RN-PRN-003/004/005)", () => {
  it("cria rascunho versão 1 com autoria e evento de criação", () => {
    const r = draft()
    expect(r).toMatchObject({ status: "draft", version: 1, rootId: "r1", authorId: "u-autor", professionalId: "p1" })
    expect(r.history.map((e) => e.action)).toEqual(["created"])
  })

  it("exige vínculo profissional para registrar", () => {
    const semVinculo = user(["professional"], "u9")
    expect(() => newDraft({ id: "x", patientId: "pa", kind: "anamnesis", title: "Anamnese", content: LONG }, semVinculo, T0)).toThrow(ForbiddenError)
  })

  it("só o autor edita o rascunho", () => {
    expect(() => editDraft(draft(), { title: "Outro", content: LONG }, other, T1)).toThrow(ForbiddenError)
    const edited = editDraft(draft(), { title: "Novo título", content: `${LONG} Mais.` }, author, T1)
    expect(edited.title).toBe("Novo título")
    expect(edited.history.map((e) => e.action)).toEqual(["created", "updated"])
  })

  it("não finaliza com conteúdo curto", () => {
    const curto = editDraft(draft(), { title: "Evolução", content: "curto" }, author, T1)
    expect(() => finalizeDraft(curto, author, T2)).toThrow(/ao menos 20 caracteres/)
  })

  it("finaliza e passa a ser imutável (CA-PRN-003)", () => {
    const { record } = finalizeDraft(draft(), author, T1)
    expect(record.status).toBe("finalized")
    expect(record.finalizedAt).toBe(T1)
    expect(() => editDraft(record, { title: "Alterado", content: LONG }, author, T2)).toThrow(ValidationError)
    expect(() => finalizeDraft(record, author, T2)).toThrow(ValidationError)
  })

  it("outro profissional não finaliza registro alheio", () => {
    expect(() => finalizeDraft(draft(), other, T1)).toThrow(ForbiddenError)
  })
})

describe("PRN — retificação (RN-PRN-006/007)", () => {
  const finalized = () => finalizeDraft(draft(), author, T1).record

  it("exige motivo com ao menos 10 caracteres", () => {
    expect(() => startRectification(finalized(), [], { id: "r2", reason: "erro" }, author, T2)).toThrow(/motivo/)
  })

  it("só o autor retifica (CA-PRN-005)", () => {
    expect(() => startRectification(finalized(), [], { id: "r2", reason: "Data digitada errada" }, other, T2)).toThrow(ForbiddenError)
  })

  it("não retifica rascunho nem versão já retificada", () => {
    expect(() => startRectification(draft(), [], { id: "r2", reason: "Data digitada errada" }, author, T2)).toThrow(ValidationError)
    const original = finalized()
    const rect = startRectification(original, [original], { id: "r2", reason: "Data digitada errada" }, author, T2)
    const { superseded } = finalizeDraft(rect, author, T2, original)
    expect(() => startRectification(superseded!, [], { id: "r3", reason: "Outra correção qualquer" }, author, T2)).toThrow(ValidationError)
  })

  it("aceita só uma retificação em rascunho por registro", () => {
    const original = finalized()
    const rect = startRectification(original, [original], { id: "r2", reason: "Data digitada errada" }, author, T2)
    expect(() => startRectification(original, [original, rect], { id: "r3", reason: "Mais uma correção" }, author, T2)).toThrow(/rascunho/)
  })

  it("preserva autoria, conteúdo e histórico da original (CA-PRN-004)", () => {
    const original = finalized()
    const rect = startRectification(original, [original], { id: "r2", reason: "Data digitada errada" }, author, T2)
    expect(rect).toMatchObject({ status: "draft", version: 2, rectifiesId: "r1", rootId: "r1", rectificationReason: "Data digitada errada" })

    const edited = editDraft(rect, { title: rect.title, content: `${LONG} Correção aplicada.` }, author, T2)
    const { record, superseded } = finalizeDraft(edited, author, T2, original)

    expect(record.status).toBe("finalized")
    expect(superseded).toMatchObject({
      id: "r1",
      status: "rectified",
      supersededById: "r2",
      authorId: original.authorId,
      content: original.content,
      title: original.title,
      createdAt: original.createdAt,
      finalizedAt: original.finalizedAt,
    })
    expect(superseded!.history.map((e) => e.action)).toEqual(["created", "finalized", "rectified"])
  })

  it("versionChain ordena versões e currentFinalized acha a vigente", () => {
    const original = finalized()
    const rect = startRectification(original, [original], { id: "r2", reason: "Data digitada errada" }, author, T2)
    const { record, superseded } = finalizeDraft(rect, author, T2, original)
    const all = [record, superseded!]
    expect(versionChain(all, "r1").map((r) => r.id)).toEqual(["r1", "r2"])
    expect(currentFinalized(all, "r1")?.id).toBe("r2")
  })
})
