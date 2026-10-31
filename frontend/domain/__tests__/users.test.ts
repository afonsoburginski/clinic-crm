import { describe, expect, it } from "vitest"

import { passwordResetSchema, userCreateSchema, userUpdateSchema } from "../schemas"

const valid = { name: "Ana Souza", email: "ana@clinica.com", roles: ["reception"], professionalId: "", active: true }

describe("USR — formulário de usuário", () => {
  it("RN-USR-004 · exige senha com ao menos 8 caracteres na criação", () => {
    expect(userCreateSchema.safeParse({ ...valid, password: "senha-forte" }).success).toBe(true)
    const short = userCreateSchema.safeParse({ ...valid, password: "curta" })
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]?.message).toBe("A senha precisa ter ao menos 8 caracteres")
  })

  it("exige nome, e-mail válido e ao menos um papel", () => {
    const messages = (input: object) => userUpdateSchema.safeParse(input).error?.issues.map((i) => i.message) ?? []
    expect(messages({ ...valid, name: " " })).toContain("Informe o nome")
    expect(messages({ ...valid, email: "sem-arroba" })).toContain("E-mail inválido")
    expect(messages({ ...valid, roles: [] })).toContain("Selecione ao menos um papel")
    expect(messages(valid)).toEqual([])
  })

  it("a edição não pede senha", () => {
    expect(userUpdateSchema.safeParse(valid).success).toBe(true)
  })

  it("redefinição: as senhas precisam conferir", () => {
    expect(passwordResetSchema.safeParse({ password: "nova-senha-1", confirm: "nova-senha-1" }).success).toBe(true)
    const mismatch = passwordResetSchema.safeParse({ password: "nova-senha-1", confirm: "outra-senha-1" })
    expect(mismatch.error?.issues[0]).toMatchObject({ message: "As senhas não conferem", path: ["confirm"] })
    expect(passwordResetSchema.safeParse({ password: "curta", confirm: "curta" }).success).toBe(false)
  })
})
