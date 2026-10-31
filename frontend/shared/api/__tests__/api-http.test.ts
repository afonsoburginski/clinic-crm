import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clinicDateTimeToISO } from "@/domain/clinic-time"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/domain/errors"
import type { AppointmentInput, GuardianLinkInput, PatientInput } from "@/domain/schemas"
import type { Role, User } from "@/domain/types"
import { useSessionStore } from "@/shared/lib/session-store"

import { DEFAULT_SETTINGS } from "../backend-mappers"
import { api } from "../api"

// Adaptador de dados contra a API Hono simulada: cada rota responde o que o backend devolve de fato.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>
interface Call {
  method: string
  path: string
  search: URLSearchParams
  body: Json
  headers: Record<string, string>
}

const reply = (status: number, body?: unknown) => ({ __reply: status, body })
const isReply = (value: unknown): value is ReturnType<typeof reply> => typeof value === "object" && value !== null && "__reply" in value

let routes: Record<string, unknown> = {}
let calls: Call[] = []
const callsTo = (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key)

beforeEach(() => {
  routes = {}
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
      const target = new URL(url, "http://clinic.test")
      const call: Call = {
        method: init.method ?? "GET",
        path: target.pathname.replace("/api/v1", ""),
        search: target.searchParams,
        body: init.body ? JSON.parse(String(init.body)) : {},
        headers: init.headers,
      }
      calls.push(call)
      const handler = routes[`${call.method} ${call.path}`]
      const result = typeof handler === "function" ? handler(call) : handler
      if (result === undefined) return new Response(JSON.stringify({ error: { code: "internal_error", message: `sem rota: ${call.method} ${call.path}` } }), { status: 500 })
      if (isReply(result)) return new Response(result.body === undefined ? "" : JSON.stringify(result.body), { status: result.__reply })
      return new Response(JSON.stringify(result), { status: 200 })
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  useSessionStore.getState().signOut()
})

let tokenSeq = 0
/** Token novo por teste: a lista de pacientes é cacheada por token. */
function signInAs(roles: Role[] = ["admin"], professionalId?: string) {
  const user: User = { id: "u1", name: "Marina Alves", email: "marina@clinica.com", title: "", roles, professionalId }
  useSessionStore.getState().signIn({ user, accessToken: `tok-${++tokenSeq}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  return user
}

const denied = reply(403, { error: { code: "forbidden", message: "forbidden" } })

describe("auth", () => {
  it("signIn autentica na API, guarda token e usuário e devolve o usuário", async () => {
    routes["POST /auth/login"] = {
      user: { id: "u-admin", name: "Marina Alves", email: "marina@clinica.com", roles: ["admin"] },
      accessToken: "raw.sig",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }
    const user = await api.auth.signIn({ email: "Marina@Clinica.com", password: "senha-forte-1" })

    expect(user).toMatchObject({ id: "u-admin", title: "Administrador", roles: ["admin"] })
    expect(callsTo("POST /auth/login")[0].body).toEqual({ email: "marina@clinica.com", password: "senha-forte-1" })
    expect(callsTo("POST /auth/login")[0].headers.Authorization).toBeUndefined()
    const session = useSessionStore.getState()
    expect(session).toMatchObject({ userId: "u-admin", accessToken: "raw.sig" })
    expect(session.user?.name).toBe("Marina Alves")
  })

  it("credenciais recusadas viram ValidationError e não criam sessão", async () => {
    routes["POST /auth/login"] = reply(401, { error: { code: "invalid_credentials", message: "E-mail ou senha incorretos." } })
    await expect(api.auth.signIn({ email: "a@b.com", password: "12345678" })).rejects.toThrow(ValidationError)
    expect(useSessionStore.getState().accessToken).toBeNull()
    await expect(api.auth.signIn({ email: "invalido", password: "1" })).rejects.toThrow(ValidationError)
  })

  it("me restaura a sessão pelo token guardado e atualiza o usuário", async () => {
    signInAs(["reception"])
    routes["GET /auth/session"] = { user: { id: "u1", name: "Marina A.", email: "marina@clinica.com", roles: ["reception", "finance"] } }
    const me = await api.auth.me()

    expect(callsTo("GET /auth/session")[0].headers.Authorization).toBe(`Bearer ${useSessionStore.getState().accessToken}`)
    expect(me.roles).toEqual(["reception", "finance"])
    expect(useSessionStore.getState().user?.name).toBe("Marina A.")
  })

  it("token recusado no /auth/session encerra a sessão local", async () => {
    signInAs()
    routes["GET /auth/session"] = reply(401, { error: { code: "unauthorized", message: "unauthorized" } })
    await expect(api.auth.me()).rejects.toThrow(ForbiddenError)
    expect(useSessionStore.getState().accessToken).toBeNull()
  })

  it("signOut limpa a sessão na hora e revoga o token no servidor", async () => {
    signInAs()
    const token = useSessionStore.getState().accessToken
    routes["POST /auth/logout"] = { ok: true }
    await api.auth.signOut()

    expect(useSessionStore.getState().accessToken).toBeNull()
    expect(callsTo("POST /auth/logout")[0].headers.Authorization).toBe(`Bearer ${token}`)
  })
})

const patientRow = (over: Json = {}) => ({
  id: "p1",
  code: "1",
  fullName: "Ana Souza",
  socialName: null,
  birthDate: "2019-05-10T00:00:00.000Z",
  document: "529.982.247-25",
  phone: null,
  email: null,
  status: "active",
  mainProfessionalId: null,
  consentData: true,
  consentImage: false,
  administrativeNotes: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-02T10:00:00.000Z",
  ...over,
})

const patientInput = (over: Partial<PatientInput> = {}): PatientInput => ({
  fullName: "Bruno Lima",
  socialName: "",
  birthDate: "2018-03-02",
  document: "",
  phone: "",
  email: "",
  address: "Rua das Flores, 10",
  status: "active",
  mainProfessionalId: "",
  consentData: true,
  consentImage: false,
  administrativeNotes: "",
  ...over,
})

describe("patients", () => {
  beforeEach(() => {
    signInAs()
    routes["GET /patients"] = {
      items: [
        patientRow({ id: "p2", code: "2", fullName: "Bruno Lima", document: null, status: "inactive" }),
        patientRow(),
      ],
    }
  })

  it("list mapeia a API e filtra no cliente por nome, código, CPF (com ou sem máscara) e status", async () => {
    const all = await api.patients.list()
    expect(all.map((p) => p.fullName)).toEqual(["Ana Souza", "Bruno Lima"])
    expect(all[0]).toMatchObject({ code: "PAC-0001", birthDate: "2019-05-10", socialName: undefined, phone: undefined })

    expect((await api.patients.list({ search: "52998224725" })).map((p) => p.id)).toEqual(["p1"])
    expect((await api.patients.list({ search: "pac-0002" })).map((p) => p.id)).toEqual(["p2"])
    expect((await api.patients.list({ status: "inactive" })).map((p) => p.id)).toEqual(["p2"])
    expect((await api.patients.list({ status: "active" })).map((p) => p.id)).toEqual(["p1"])
    expect(callsTo("GET /patients")).toHaveLength(1)
  })

  it("get usa GET /patients/:id e não inventa datas que a API não devolve", async () => {
    routes["GET /patients/p1"] = { ...patientRow(), createdAt: undefined, updatedAt: undefined }
    await expect(api.patients.get("p1")).resolves.toMatchObject({ id: "p1", code: "PAC-0001", createdAt: "" })

    routes["GET /patients/zz"] = reply(404, { error: { code: "not_found", message: "not_found" } })
    await expect(api.patients.get("zz")).rejects.toThrow(new NotFoundError("Paciente não encontrado."))
  })

  it("create bloqueia CPF repetido (mesmos dígitos, outra máscara) sem chamar a API", async () => {
    await expect(api.patients.create(patientInput({ document: "52998224725" }))).rejects.toThrow("Já existe um paciente com este CPF.")
    expect(callsTo("POST /patients")).toHaveLength(0)
  })

  it("create envia só o que foi preenchido e devolve o paciente completo", async () => {
    routes["POST /patients"] = { id: "p3", code: "PAC-0003", fullName: "Bruno Lima", birthDate: "2018-03-02T00:00:00.000Z", status: "active", createdAt: "2026-02-01T09:00:00.000Z" }
    const created = await api.patients.create(patientInput({ document: "111.444.777-35" }))

    const body = callsTo("POST /patients")[0].body
    expect(body).toEqual({
      fullName: "Bruno Lima",
      birthDate: "2018-03-02",
      document: "111.444.777-35",
      status: "active",
      consentData: true,
      consentImage: false,
    })
    expect(created).toMatchObject({ id: "p3", code: "PAC-0003", birthDate: "2018-03-02", document: "111.444.777-35", consentData: true })
  })

  it("update envia null para limpar campos e devolve o cadastro atualizado", async () => {
    routes["PATCH /patients/p1"] = { id: "p1", fullName: "Ana Souza", status: "active" }
    routes["GET /patients/p1"] = patientRow({ phone: "(11) 91234-5678" })
    const updated = await api.patients.update("p1", patientInput({ fullName: "Ana Souza", document: "529.982.247-25", phone: "(11) 91234-5678" }))

    const body = callsTo("PATCH /patients/p1")[0].body
    expect(body).toMatchObject({ socialName: null, email: null, mainProfessionalId: null, administrativeNotes: null, phone: "(11) 91234-5678", document: "529.982.247-25" })
    expect(body).not.toHaveProperty("address")
    expect(updated).toMatchObject({ id: "p1", phone: "(11) 91234-5678" })
  })

  it("checkDuplicates detecta o mesmo documento na lista da API", async () => {
    const matches = await api.patients.checkDuplicates({ fullName: "Outro Nome Qualquer", document: "52998224725" })
    expect(matches.map((m) => m.patient.id)).toEqual(["p1"])
    expect(matches[0].reasons).toContain("Mesmo documento")
  })
})

const link = (over: Json = {}) => ({
  id: "l1",
  clinic_id: "c",
  patient_id: "p1",
  guardian_id: "g1",
  relationship: "Mãe",
  is_legal_guardian: true,
  can_schedule: true,
  can_receive_documents: true,
  is_primary_contact: true,
  restrictions: null,
  ...over,
})

const linkInput = (over: Partial<GuardianLinkInput> = {}): GuardianLinkInput => ({
  guardianId: "g2",
  relationship: "Pai",
  isLegalGuardian: false,
  canSchedule: true,
  canReceiveDocuments: false,
  isPrimaryContact: false,
  restrictions: "",
  ...over,
})

describe("guardians", () => {
  beforeEach(() => {
    signInAs()
    routes["GET /patient-guardians"] = { items: [link()] }
    routes["GET /guardians"] = {
      items: [
        { id: "g2", full_name: "Carlos Lima", phone: "11999990000", document: null, email: null, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "g1", full_name: "Maria Souza", phone: "11988880000", document: null, email: null, created_at: "2026-01-01T00:00:00.000Z" },
      ],
    }
    routes["GET /patients"] = { items: [patientRow()] }
  })

  it("list junta responsáveis, vínculos e pacientes e ordena por nome", async () => {
    const rows = await api.guardians.list()
    expect(rows.map((r) => r.guardian.fullName)).toEqual(["Carlos Lima", "Maria Souza"])
    expect(rows[0].patients).toEqual([])
    expect(rows[1].patients[0]).toMatchObject({ link: { relationship: "Mãe", isPrimaryContact: true }, patient: { id: "p1" } })
    expect((await api.guardians.list("1198")).map((r) => r.guardian.id)).toEqual(["g1"])
  })

  it("forPatient devolve o contato principal primeiro", async () => {
    routes["GET /patient-guardians"] = { items: [link({ id: "l2", guardian_id: "g2", is_primary_contact: false }), link()] }
    const rows = await api.guardians.forPatient("p1")
    expect(callsTo("GET /patient-guardians")[0].search.get("patientId")).toBe("p1")
    expect(rows.map((r) => r.guardian.id)).toEqual(["g1", "g2"])
  })

  it("novo contato principal libera o anterior antes de gravar (a API só aceita um)", async () => {
    routes["PATCH /patient-guardians/l1"] = link({ is_primary_contact: false })
    routes["POST /patient-guardians"] = reply(200, link({ id: "l2" }))
    await api.guardians.link("p1", linkInput({ isPrimaryContact: true }))

    expect(callsTo("PATCH /patient-guardians/l1")[0].body).toEqual({ isPrimaryContact: false })
    expect(callsTo("POST /patient-guardians")[0].body).toEqual({
      relationship: "Pai",
      isLegalGuardian: false,
      canSchedule: true,
      canReceiveDocuments: false,
      isPrimaryContact: true,
      patientId: "p1",
      guardianId: "g2",
    })
    expect(calls.findIndex((c) => c.method === "PATCH")).toBeLessThan(calls.findIndex((c) => c.method === "POST"))
  })

  it("recusa vincular de novo o mesmo responsável", async () => {
    await expect(api.guardians.link("p1", linkInput({ guardianId: "g1" }))).rejects.toThrow("Este responsável já está vinculado ao paciente.")
    expect(callsTo("POST /patient-guardians")).toHaveLength(0)
  })

  it("editar um vínculo existente usa PATCH; trocar o responsável remove e recria", async () => {
    routes["PATCH /patient-guardians/l1"] = link()
    await api.guardians.link("p1", linkInput({ guardianId: "g1", relationship: "Mãe (guarda)", isPrimaryContact: true, restrictions: "" }), "l1")
    expect(callsTo("PATCH /patient-guardians/l1")[0].body).toMatchObject({ relationship: "Mãe (guarda)", restrictions: "" })

    routes["DELETE /patient-guardians/l1"] = { ok: true }
    routes["POST /patient-guardians"] = link({ id: "l9", guardian_id: "g2" })
    await api.guardians.link("p1", linkInput({ guardianId: "g2" }), "l1")
    expect(callsTo("DELETE /patient-guardians/l1")).toHaveLength(1)
    expect(callsTo("POST /patient-guardians")[0].body).toMatchObject({ guardianId: "g2", patientId: "p1" })
  })

  it("create devolve o responsável mapeado; update avisa que a API não expõe a edição", async () => {
    routes["POST /guardians"] = { id: "g3", full_name: "Rita Costa", phone: "11977770000", document: null, email: null, created_at: "2026-02-01T00:00:00.000Z" }
    await expect(api.guardians.create({ fullName: "Rita Costa", document: "", phone: "(11) 97777-0000", email: "" })).resolves.toMatchObject({ id: "g3", fullName: "Rita Costa" })
    expect(callsTo("POST /guardians")[0].body).toEqual({ fullName: "Rita Costa", phone: "(11) 97777-0000" })

    routes["PATCH /guardians/g3"] = reply(404, "404 Not Found")
    await expect(api.guardians.update("g3", { fullName: "Rita Costa", document: "", phone: "(11) 97777-0000", email: "" })).rejects.toThrow(/ainda não está disponível/)
  })

  it("unlink remove o vínculo na API", async () => {
    routes["DELETE /patient-guardians/l1"] = { ok: true }
    await api.guardians.unlink("l1")
    expect(callsTo("DELETE /patient-guardians/l1")).toHaveLength(1)
  })
})

describe("catálogo e profissionais", () => {
  beforeEach(() => signInAs())

  it("serviço: preço em centavos, status derivado de `active` e PATCH quando há id", async () => {
    routes["POST /services"] = { id: "s1" }
    routes["PATCH /services/s1"] = { id: "s1" }
    const input = { name: "Sessão de psicoterapia", specialtyId: "e1", durationMin: 50, referencePrice: 150.5, requiresRoom: true, active: false }
    await api.services.save(input)
    await api.services.save(input, "s1")

    expect(callsTo("POST /services")[0].body).toEqual({
      name: "Sessão de psicoterapia",
      specialtyId: "e1",
      durationMin: 50,
      referencePriceCents: 15050,
      requiresRoom: true,
      active: false,
      status: "inactive",
    })
    expect(callsTo("PATCH /services/s1")).toHaveLength(1)
  })

  it("listas vêm ordenadas por nome, já que a API ordena por última alteração", async () => {
    routes["GET /rooms"] = { items: [{ id: "r2", name: "Sala Girassol", capacity: 2, exclusive: true }, { id: "r1", name: "Sala Ipê", capacity: 1, exclusive: false, active: false }] }
    const rooms = await api.rooms.list()
    expect(rooms.map((r) => r.name)).toEqual(["Sala Girassol", "Sala Ipê"])
    expect(rooms[1]).toMatchObject({ active: false, exclusive: false })
  })

  it("profissional novo nasce com cor, grade vazia e data de criação", async () => {
    routes["GET /professionals"] = { items: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] }
    routes["POST /professionals"] = (call: Call) => ({ id: "novo", ...call.body })
    const created = await api.professionals.save({ name: "Helena Ramos", email: "helena@clinica.com", phone: "", registry: "CRP 06/1", specialtyIds: ["e1"], active: true })

    expect(callsTo("POST /professionals")[0].body).toMatchObject({ colorIndex: 3, schedule: [], unavailabilities: [], status: "active", specialtyIds: ["e1"] })
    expect(created).toMatchObject({ id: "novo", name: "Helena Ramos", phone: undefined, registry: "CRP 06/1", colorIndex: 3 })
  })

  it("grade com faixas sobrepostas é recusada antes de chamar a API", async () => {
    await expect(
      api.professionals.setSchedule("pr1", [
        { weekday: 1, start: "08:00", end: "12:00" },
        { weekday: 1, start: "11:00", end: "14:00" },
      ])
    ).rejects.toThrow(/sobrepostas/)
    expect(calls).toHaveLength(0)

    routes["PUT /professionals/pr1/schedule"] = { id: "pr1" }
    await api.professionals.setSchedule("pr1", [{ weekday: 1, start: "08:00", end: "12:00" }])
    expect(callsTo("PUT /professionals/pr1/schedule")[0].body).toEqual({ schedule: [{ weekday: 1, start: "08:00", end: "12:00" }] })
  })

  it("indisponibilidade leva id gerado no cliente (é por ele que a remoção acha o item)", async () => {
    routes["POST /professionals/pr1/unavailabilities"] = { id: "pr1" }
    routes["DELETE /professionals/pr1/unavailabilities/un-1"] = { id: "pr1" }
    await api.professionals.addUnavailability("pr1", { date: "2030-01-07", startTime: "14:00", endTime: "16:00", reason: "Congresso" })
    await api.professionals.removeUnavailability("pr1", "un-1")

    expect(callsTo("POST /professionals/pr1/unavailabilities")[0].body).toEqual({
      id: expect.stringMatching(/^un-/),
      start: clinicDateTimeToISO("2030-01-07", "14:00"),
      end: clinicDateTimeToISO("2030-01-07", "16:00"),
      reason: "Congresso",
    })
    expect(callsTo("DELETE /professionals/pr1/unavailabilities/un-1")).toHaveLength(1)
  })

  it("configurações: perfis sem acesso usam o padrão; salvar devolve o que a API gravou", async () => {
    routes["GET /settings"] = denied
    await expect(api.settings.get()).resolves.toEqual(DEFAULT_SETTINGS)

    routes["GET /settings"] = {}
    await expect(api.settings.get()).resolves.toEqual(DEFAULT_SETTINGS)

    const input = {
      ...DEFAULT_SETTINGS,
      name: "Clínica Sol",
      legalName: "Sol Saúde Ltda.",
      document: "12.345.678/0001-90",
      phone: "(11) 3322-4455",
      email: "contato@clinicasol.com",
      address: "Rua das Acácias, 210",
    }
    routes["PUT /settings"] = (call: Call) => ({ id: "cfg", status: "draft", ...call.body })
    await expect(api.settings.update(input)).resolves.toEqual(input)
  })

  it("auditoria: filtros convertidos para o formato da API e entradas completadas", async () => {
    routes["GET /audit"] = {
      items: [
        { actorId: "u1", at: "2026-02-01T10:00:00.000Z", action: "update", resource: "clinical-record", resourceId: "r1", summary: "Alterou registro clínico", changes: null },
        { actorId: "u9", at: "2026-02-01T09:00:00.000Z", action: "create", resource: "room", resourceId: "r2", summary: "Alterou room", changes: [{ field: "name", from: null, to: null }] },
      ],
    }
    const entries = await api.audit.list({ resource: "clinical_record", actorId: "all" })

    const query = callsTo("GET /audit")[0].search
    expect(query.get("resource")).toBe("clinical-record")
    expect(query.has("actorId")).toBe(false)
    expect(entries.map((e) => [e.resource, e.actorName])).toEqual([["clinical_record", "Marina Alves"], ["room", "u9"]])
    expect(entries[1].changes).toEqual({ name: { from: null, to: null } })
    expect(new Set(entries.map((e) => e.id)).size).toBe(2)
  })
})

const apptRow = (over: Json = {}) => ({
  id: "a1",
  kind: "appointment",
  title: null,
  patientId: "p1",
  professionalId: "pr1",
  serviceId: "s1",
  roomId: null,
  start: "2030-01-07T13:00:00.000Z",
  end: "2030-01-07T14:00:00.000Z",
  status: "confirmed",
  notes: null,
  createdBy: "u1",
  ...over,
})

const MONDAY = "2030-01-07"
const slot = (start: string, end: string, over: Partial<AppointmentInput> = {}): AppointmentInput => ({
  kind: "appointment",
  patientId: "p1",
  serviceId: "s1",
  professionalId: "pr1",
  start: clinicDateTimeToISO(MONDAY, start),
  end: clinicDateTimeToISO(MONDAY, end),
  ...over,
})

describe("appointments", () => {
  beforeEach(() => {
    signInAs()
    routes["GET /patients/p1"] = patientRow()
  })

  it("list passa à API um único profissional/status e refina os demais no cliente", async () => {
    routes["GET /appointments"] = {
      items: [
        apptRow({ id: "b", start: "2030-01-07T15:00:00.000Z", end: "2030-01-07T16:00:00.000Z", professionalId: "pr2", roomId: "r1" }),
        apptRow({ id: "a", status: "pending" }),
        apptRow({ id: "c", professionalId: "pr3", status: "cancelled" }),
      ],
    }
    const from = "2030-01-07T00:00:00.000Z"
    const to = "2030-01-14T00:00:00.000Z"

    await api.appointments.list({ from, to, professionalIds: ["pr1"], status: ["confirmed"], patientId: "p1" })
    const single = callsTo("GET /appointments")[0].search
    expect([single.get("professionalId"), single.get("status"), single.get("patientId")]).toEqual(["pr1", "confirmed", "p1"])

    const many = await api.appointments.list({ from, to, professionalIds: ["pr1", "pr2"], status: ["confirmed", "pending"] })
    const multiple = callsTo("GET /appointments")[1].search
    expect(multiple.has("professionalId") || multiple.has("status")).toBe(false)
    expect(many.map((a) => a.id)).toEqual(["a", "b"])
    expect((await api.appointments.list({ from, to, roomId: "r1" })).map((a) => a.id)).toEqual(["b"])
  })

  it("forPatient completa o paciente que a rota não devolve", async () => {
    const { patientId: _omit, ...row } = apptRow()
    routes["GET /patients/p1/appointments"] = { items: [row, { ...row, id: "a2", start: "2030-02-01T13:00:00.000Z", end: "2030-02-01T14:00:00.000Z" }] }
    const list = await api.appointments.forPatient("p1")
    expect(list.map((a) => [a.id, a.patientId])).toEqual([["a2", "p1"], ["a1", "p1"]])
  })

  it("RN-AGD-014: criação só aceita solicitado, pendente ou confirmado — sem chamar a API", async () => {
    for (const status of ["in_progress", "completed", "cancelled", "no_show"]) {
      await expect(api.appointments.create(slot("10:00", "11:00", { status } as unknown as Partial<AppointmentInput>))).rejects.toThrow(/solicitado, pendente ou confirmado/)
    }
    await expect(api.appointments.create(slot("10:00", "11:00", { patientId: "" }))).rejects.toThrow("Selecione o paciente.")
    await expect(api.appointments.create({ ...slot("10:00", "11:00"), kind: "block", title: " " })).rejects.toThrow("Informe o motivo do bloqueio.")
    expect(calls).toHaveLength(0)
  })

  it("paciente inativo não agenda", async () => {
    routes["GET /patients/p1"] = patientRow({ status: "inactive" })
    routes["GET /professionals/pr1"] = denied
    routes["GET /settings"] = denied
    await expect(api.appointments.create(slot("10:00", "11:00"))).rejects.toThrow("Paciente inativo ou inexistente.")
    expect(callsTo("POST /appointments")).toHaveLength(0)
  })

  it("recorrência semanal vira uma criação por semana (a API não tem recorrência)", async () => {
    routes["GET /professionals/pr1"] = denied
    routes["GET /settings"] = denied
    let seq = 0
    routes["POST /appointments"] = (call: Call) => ({ id: `n${++seq}`, ...call.body })
    const created = await api.appointments.create(slot("10:00", "11:00", { recurrenceWeeks: 3, notes: " primeira vez " }))

    const posts = callsTo("POST /appointments")
    expect(posts).toHaveLength(3)
    expect(posts.map((c) => c.body.start)).toEqual([0, 7, 14].map((d) => new Date(new Date(slot("10:00", "11:00").start).getTime() + d * 86_400_000).toISOString()))
    expect(posts[0].body).toMatchObject({ kind: "appointment", status: "confirmed", patientId: "p1", serviceId: "s1", professionalId: "pr1", notes: "primeira vez" })
    expect(created.map((a) => a.id)).toEqual(["n1", "n2", "n3"])
    expect(created[0]).toMatchObject({ status: "confirmed", professionalId: "pr1", createdBy: "u1" })
  })

  it("conflito detectado antes de gravar traz os motivos e o próximo horário livre", async () => {
    routes["GET /professionals/pr1"] = { id: "pr1", name: "Helena Ramos", email: "h@c.com", active: true, specialtyIds: ["e1"], schedule: [{ weekday: 1, start: "08:00", end: "12:00" }], unavailabilities: [] }
    routes["GET /settings"] = {}
    routes["GET /services/s1"] = { id: "s1", name: "Sessão", specialtyId: "e1", durationMin: 60, active: true, requiresRoom: false }
    routes["GET /appointments"] = {
      items: [apptRow({ id: "busy", start: clinicDateTimeToISO(MONDAY, "09:00"), end: clinicDateTimeToISO(MONDAY, "10:00") })],
    }
    const error = await api.appointments.create(slot("09:30", "10:30")).catch((e) => e)

    expect(error).toBeInstanceOf(ConflictError)
    expect(error.conflicts.map((c: { type: string }) => c.type)).toEqual(["professional_busy"])
    // Mesmo instante, só muda a notação (`-03:00` do clinicDateTimeToISO × `Z` da sugestão).
    const instant = (iso: string) => new Date(iso).toISOString()
    expect(error.suggestion).toEqual({ start: instant(clinicDateTimeToISO(MONDAY, "10:00")), end: instant(clinicDateTimeToISO(MONDAY, "11:00")) })
    expect(callsTo("POST /appointments")).toHaveLength(0)
  })

  it("regras de agenda rodam no cliente: fora da grade do profissional e serviço de outra especialidade", async () => {
    routes["GET /professionals/pr1"] = { id: "pr1", name: "Helena Ramos", active: true, specialtyIds: ["e1"], schedule: [{ weekday: 1, start: "08:00", end: "12:00" }], unavailabilities: [] }
    routes["GET /settings"] = {}
    routes["GET /appointments"] = { items: [] }
    routes["GET /services/s1"] = { id: "s1", specialtyId: "e2", active: true }
    await expect(api.appointments.create(slot("09:00", "10:00"))).rejects.toThrow(/não atende a especialidade/)

    routes["GET /services/s1"] = { id: "s1", specialtyId: "e1", active: true }
    const outside = await api.appointments.check({ professionalId: "pr1", start: clinicDateTimeToISO(MONDAY, "15:00"), end: clinicDateTimeToISO(MONDAY, "16:00") })
    expect(outside.conflicts.map((c) => c.type)).toEqual(["outside_schedule"])
  })

  it("409 do servidor (corrida) vira ConflictError legível", async () => {
    routes["GET /professionals/pr1"] = denied
    routes["GET /settings"] = denied
    routes["POST /appointments"] = reply(409, { error: { code: "conflict", message: "conflict" } })
    const error = await api.appointments.create(slot("10:00", "11:00")).catch((e) => e)
    expect(error).toBeInstanceOf(ConflictError)
    expect(error.message).toMatch(/horário já ocupado/)
  })

  it("reagendar recusa atendimento encerrado e envia só o que a API altera", async () => {
    routes["GET /professionals/pr1"] = denied
    routes["GET /settings"] = denied
    routes["GET /appointments/a1"] = { ...apptRow(), status: "completed" }
    await expect(api.appointments.reschedule("a1", slot("10:00", "11:00"))).rejects.toThrow("Agendamentos encerrados não podem ser alterados.")

    routes["GET /appointments/a1"] = {
      id: "a1",
      kind: "appointment",
      patient_id: "p1",
      professional_id: "pr1",
      service_id: "s1",
      room_id: null,
      starts_at: "2030-01-07T13:00:00.000Z",
      ends_at: "2030-01-07T14:00:00.000Z",
      status: "confirmed",
      created_by: "u1",
      created_at: "2026-01-01T00:00:00.000Z",
    }
    routes["PATCH /appointments/a1"] = { id: "a1", status: "confirmed" }
    const moved = await api.appointments.reschedule("a1", slot("10:00", "11:00", { notes: "ignorado pela API" }))

    expect(callsTo("PATCH /appointments/a1")[0].body).toEqual({
      start: clinicDateTimeToISO(MONDAY, "10:00"),
      end: clinicDateTimeToISO(MONDAY, "11:00"),
      professionalId: "pr1",
      patientId: "p1",
    })
    expect(moved).toMatchObject({ id: "a1", patientId: "p1", professionalId: "pr1", createdAt: "2026-01-01T00:00:00.000Z" })
  })

  it("RN-AGD-015: atendimento em curso não troca de profissional", async () => {
    routes["GET /professionals/pr2"] = denied
    routes["GET /settings"] = denied
    routes["GET /appointments/a1"] = apptRow({ status: "in_progress" })
    await expect(api.appointments.reschedule("a1", slot("10:00", "11:00", { professionalId: "pr2" }))).rejects.toThrow(/em curso/)
    expect(callsTo("PATCH /appointments/a1")).toHaveLength(0)
  })

  it("changeStatus respeita a máquina de estados, exige motivo ao cancelar e devolve o agendamento atualizado", async () => {
    routes["GET /settings"] = { requireCancelReason: true }
    let status = "confirmed"
    routes["GET /appointments/a1"] = () => apptRow({ status })
    routes["POST /appointments/a1/status"] = (call: Call) => {
      status = call.body.status
      return { id: "a1", status }
    }

    await expect(api.appointments.changeStatus("a1", "completed")).rejects.toThrow(ForbiddenError)
    await expect(api.appointments.changeStatus("a1", "cancelled", "  ")).rejects.toThrow("Informe o motivo do cancelamento.")
    expect(callsTo("POST /appointments/a1/status")).toHaveLength(0)

    const started = await api.appointments.changeStatus("a1", "in_progress")
    expect(callsTo("POST /appointments/a1/status")[0].body).toEqual({ status: "in_progress" })
    expect(started.status).toBe("in_progress")

    // Em atendimento só avança para concluído: a regra do domínio vale antes de qualquer chamada.
    await expect(api.appointments.changeStatus("a1", "cancelled", "Paciente viajou")).rejects.toThrow(ForbiddenError)
    expect(callsTo("POST /appointments/a1/status")).toHaveLength(1)
  })

  it("cancelar devolve motivo e quem cancelou", async () => {
    routes["GET /settings"] = denied
    let status = "confirmed"
    routes["GET /appointments/a1"] = () => apptRow({ status })
    routes["POST /appointments/a1/status"] = () => {
      status = "cancelled"
      return { id: "a1", status }
    }

    const cancelled = await api.appointments.changeStatus("a1", "cancelled", " Paciente viajou ")
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Paciente viajou", cancelledBy: "u1" })
    expect(cancelled.cancelledAt).toBeTruthy()
  })
})

describe("dashboard", () => {
  const dashboardRoutes = () => {
    routes["GET /appointments"] = {
      items: [
        apptRow({ id: "past", status: "completed", start: "2030-01-09T13:00:00.000Z", end: "2030-01-09T14:00:00.000Z" }),
        apptRow({ id: "later", status: "confirmed", start: "2030-01-09T17:00:00.000Z", end: "2030-01-09T18:00:00.000Z" }),
        apptRow({ id: "off", status: "cancelled", start: "2030-01-07T13:00:00.000Z", end: "2030-01-07T14:00:00.000Z" }),
        apptRow({ id: "friday", status: "pending", start: "2030-01-11T13:00:00.000Z", end: "2030-01-11T14:00:00.000Z" }),
        apptRow({ id: "block", kind: "block", status: "confirmed", start: "2030-01-09T19:00:00.000Z", end: "2030-01-09T20:00:00.000Z" }),
      ],
    }
    routes["GET /patients"] = {
      items: [patientRow({ id: "p1" }), patientRow({ id: "p2", document: null }), patientRow({ id: "p3", document: null, status: "inactive" })],
    }
  }

  beforeEach(() => {
    // Quarta-feira, 12:00 em São Paulo; só `Date` é simulado para não travar as promessas.
    // A sessão nasce depois do relógio simulado, senão o token já nasceria vencido.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2030-01-09T15:00:00.000Z"))
    signInAs()
    dashboardRoutes()
  })

  it("monta o resumo do dia e da semana a partir da agenda, dos pacientes e da grade", async () => {
    routes["GET /professionals"] = {
      items: [
        { id: "pr1", name: "Helena Ramos", active: true, colorIndex: 2, schedule: [1, 3, 5].map((weekday) => ({ weekday, start: "08:00", end: "12:00" })) },
        { id: "pr2", name: "Rafael Dias", active: false, colorIndex: 1, schedule: [] },
      ],
    }
    const summary = await api.dashboard.summary()

    expect(summary.scoped).toBe(false)
    expect(summary.today).toEqual({ total: 2, confirmed: 1, awaiting: 0, completed: 1, inProgress: 0 })
    expect(summary.week).toEqual({ total: 3, cancelled: 1, noShow: 0, awaiting: 1 })
    expect(summary.activePatients).toBe(2)
    expect(summary.upcoming.map((a) => a.id)).toEqual(["later", "friday"])
    expect(summary.occupancy).toEqual([{ professionalId: "pr1", name: "Helena Ramos", colorIndex: 2, booked: 180, capacity: 720, rate: 25 }])

    const query = callsTo("GET /appointments")[0].search
    expect(query.get("from")).toBe("2030-01-07T03:00:00.000Z")
  })

  it("perfis sem acesso a profissionais e pacientes recebem o resumo da agenda, sem ocupação", async () => {
    routes["GET /professionals"] = denied
    routes["GET /patients"] = denied
    const summary = await api.dashboard.summary()

    expect(summary.occupancy).toEqual([])
    expect(summary.activePatients).toBe(0)
    expect(summary.week.total).toBe(3)
  })

  it("profissional (agenda própria) conta os pacientes que a API devolve para ele", async () => {
    signInAs(["professional"], "pr1")
    routes["GET /professionals"] = denied
    const summary = await api.dashboard.summary()

    expect(summary.scoped).toBe(true)
    expect(summary.activePatients).toBe(3)
  })
})
