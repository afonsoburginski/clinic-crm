import { describe, expect, test } from "bun:test";
import { patientProfessionalScope } from "../src/application/patient-scope";
import type { User } from "../src/application/auth";

const user = (roles: User["roles"], professionalId?: string): User => ({ id: "u", name: "Teste", email: "demo@example.test", roles, professionalId });

describe("escopo de pacientes", () => {
  test("restringe profissionais ao vínculo", () => expect(patientProfessionalScope(user(["professional"], "p1"))).toBe("p1"));
  test("nega profissionais sem vínculo", () => expect(() => patientProfessionalScope(user(["professional"]))).toThrow("forbidden"));
  test("permite leitura ampla apenas ao perfil autorizado", () => expect(patientProfessionalScope(user(["admin"]))).toBeUndefined());
  test("nega perfis sem permissão de leitura", () => expect(() => patientProfessionalScope(user(["manager"]))).toThrow("forbidden"));
});
