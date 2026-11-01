import { describe, expect, it } from "vitest"

import {
  activeReleases,
  buildRelease,
  canTransitionDocument,
  documentAccess,
  revokeAllReleases,
  revokeRelease,
  validateTransition,
} from "../documents"
import { ValidationError } from "../errors"
import type { ClinicalRecord, DocumentClassification, PatientDocument, Role, User } from "../types"

const user = (roles: Role[], professionalId?: string): User => ({ id: `u-${roles.join("")}`, name: "Teste", email: "t@t.com", title: "", roles, professionalId })

const T = "2026-05-01T10:00:00.000Z"
const doc = (over: Partial<PatientDocument> = {}): PatientDocument => ({
  id: "d1",
  patientId: "pa-1",
  title: "Relatório",
  type: "Relatório",
  classification: "administrative",
  status: "issued",
  releases: [],
  createdBy: "u",
  createdByName: "Teste",
  createdAt: T,
  updatedAt: T,
  ...over,
})

const allowed = { canReceiveDocuments: true }

describe("DOC — acesso por classificação (RN-DOC-001)", () => {
  const read = (u: User, c: DocumentClassification, own = true) => documentAccess(u, c, own).read
  const write = (u: User, c: DocumentClassification, own = true) => documentAccess(u, c, own).write

  it("recepção vê só administrativos, nunca clínico ou financeiro (CA-DOC-003)", () => {
    const rec = user(["reception"])
    expect(read(rec, "administrative")).toBe(true)
    expect(write(rec, "administrative")).toBe(true)
    expect(read(rec, "clinical")).toBe(false)
    expect(read(rec, "financial")).toBe(false)
  })

  it("financeiro vê administrativo e financeiro, escreve só financeiro", () => {
    const fin = user(["finance"])
    expect(read(fin, "financial")).toBe(true)
    expect(write(fin, "financial")).toBe(true)
    expect(read(fin, "administrative")).toBe(true)
    expect(write(fin, "administrative")).toBe(false)
    expect(read(fin, "clinical")).toBe(false)
  })

  it("administrador acessa e escreve em qualquer classificação, de qualquer paciente", () => {
    const adm = user(["admin"])
    for (const classification of ["clinical", "financial", "administrative"] as const) {
      expect(read(adm, classification, false)).toBe(true)
      expect(write(adm, classification, false)).toBe(true)
    }
  })

  it("profissional acessa clínico só de paciente próprio", () => {
    const pro = user(["professional"], "p1")
    expect(read(pro, "clinical", true)).toBe(true)
    expect(write(pro, "clinical", true)).toBe(true)
    expect(read(pro, "clinical", false)).toBe(false)
    expect(read(pro, "administrative", false)).toBe(false)
    expect(read(pro, "administrative", true)).toBe(true)
    expect(read(pro, "financial")).toBe(false)
  })

  it("gestor e anônimo não acessam documentos", () => {
    expect(read(user(["manager"]), "administrative")).toBe(false)
    expect(documentAccess(null, "administrative", true)).toEqual({ read: false, write: false })
  })
})

describe("DOC — estados (RN-DOC-003)", () => {
  it("transições permitidas", () => {
    expect(canTransitionDocument("draft", "issued")).toBe(true)
    expect(canTransitionDocument("issued", "archived")).toBe(true)
    expect(canTransitionDocument("issued", "draft")).toBe(false)
    expect(canTransitionDocument("archived", "issued")).toBe(false)
  })

  it("documento clínico só é emitido com registro vinculado finalizado", () => {
    const clinical = doc({ classification: "clinical", status: "draft", clinicalRecordId: "r1" })
    expect(() => validateTransition(clinical, "issued", undefined)).toThrow(/finalizado/)
    expect(() => validateTransition(clinical, "issued", { status: "draft" } as ClinicalRecord)).toThrow(/finalizado/)
    expect(() => validateTransition(clinical, "issued", { status: "finalized" } as ClinicalRecord)).not.toThrow()
  })

  it("documento administrativo é emitido sem registro clínico", () => {
    expect(() => validateTransition(doc({ status: "draft" }), "issued")).not.toThrow()
  })
})

describe("DOC — liberação explícita a responsáveis (RN-DOC-004/005)", () => {
  const releaser = user(["reception"])

  it("recusa documento em rascunho (CA-DOC-001)", () => {
    expect(() => buildRelease(doc({ status: "draft" }), allowed, "g1", "rl1", releaser, T)).toThrow(/emitidos/)
  })

  it("recusa responsável sem permissão de receber documentos (CA-DOC-002)", () => {
    expect(() => buildRelease(doc(), { canReceiveDocuments: false }, "g1", "rl1", releaser, T)).toThrow(/não está autorizado/)
    expect(() => buildRelease(doc(), undefined, "g1", "rl1", releaser, T)).toThrow(/não está vinculado/)
  })

  it("libera de forma individual e registra autor e data", () => {
    const release = buildRelease(doc(), allowed, "g1", "rl1", releaser, T)
    expect(release).toMatchObject({ guardianId: "g1", releasedBy: releaser.id, releasedAt: T })
    expect(activeReleases(doc())).toEqual([])
  })

  it("não duplica liberação ativa, mas permite após revogar", () => {
    const released = doc({ releases: [buildRelease(doc(), allowed, "g1", "rl1", releaser, T)] })
    expect(() => buildRelease(released, allowed, "g1", "rl2", releaser, T)).toThrow(/já está liberado/)
    const revoked = revokeRelease(released, "rl1", "Responsável trocou de e-mail", releaser, T)
    expect(() => buildRelease(revoked, allowed, "g1", "rl2", releaser, T)).not.toThrow()
  })

  it("revogar exige motivo e preserva o registro", () => {
    const released = doc({ releases: [buildRelease(doc(), allowed, "g1", "rl1", releaser, T)] })
    expect(() => revokeRelease(released, "rl1", "x", releaser, T)).toThrow(ValidationError)
    const revoked = revokeRelease(released, "rl1", "Liberado por engano", releaser, T)
    expect(revoked.releases).toHaveLength(1)
    expect(revoked.releases[0]).toMatchObject({ revokedAt: T, revokedBy: releaser.id, revokeReason: "Liberado por engano" })
    expect(() => revokeRelease(revoked, "rl1", "Outra vez aqui", releaser, T)).toThrow(/já foi revogada/)
  })

  it("arquivar ou retificar revoga tudo o que estava liberado (CA-DOC-004, RN-DOC-006)", () => {
    const released = doc({
      releases: [
        buildRelease(doc(), allowed, "g1", "rl1", releaser, T),
        buildRelease(doc(), allowed, "g2", "rl2", releaser, T),
      ],
    })
    const after = revokeAllReleases(released, "Documento arquivado", releaser, T)
    expect(activeReleases(after)).toEqual([])
    expect(after.releases).toHaveLength(2)
    expect(after.releases.every((r) => r.revokeReason === "Documento arquivado")).toBe(true)
  })
})
