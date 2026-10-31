import { describe, expect, test } from "bun:test";
import { createPatientUseCases } from "../src/application/patients";
import type { PatientResult, PatientsRepository } from "../src/application/patients-repository";

function fakeRepository() {
  const calls: Array<[string, ...unknown[]]> = [];
  let result: PatientResult = { rows: [{ id: "one", patient_id: "patient", guardian_id: "guardian" }], rowCount: 1 };
  const repository = new Proxy({} as PatientsRepository, {
    get: (_target, name: string) => async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return result;
    },
  });
  return { repository, calls, setResult: (value: PatientResult) => { result = value; } };
}

describe("patient use cases", () => {
  test("passes clinic, search and professional filters through", async () => {
    const fake = fakeRepository();
    const useCases = createPatientUseCases(fake.repository);
    await useCases.list("clinic", "Ana", "professional");
    await useCases.duplicates("clinic", "document", "2000-01-01", "Ana");
    expect(fake.calls).toEqual([
      ["list", "clinic", "Ana", "professional"],
      ["duplicates", "clinic", "document", "2000-01-01", "Ana"],
    ]);
  });

  test("validates patient and guardian input before persistence", async () => {
    const fake = fakeRepository();
    const useCases = createPatientUseCases(fake.repository);
    await expect(useCases.create("clinic", { fullName: "A", birthDate: "2000-01-01" })).rejects.toThrow("validation");
    await expect(useCases.update("clinic", "one", { unknown: true })).rejects.toThrow("validation");
    await expect(useCases.createGuardian("clinic", { fullName: "Ana" })).rejects.toThrow("validation");
    await expect(useCases.createPatientGuardian("clinic", { patientId: "one" })).rejects.toThrow("validation");
    expect(fake.calls).toEqual([]);
  });

  test("reports missing records and revokes releases after deleting a link", async () => {
    const fake = fakeRepository();
    const useCases = createPatientUseCases(fake.repository);
    expect(await useCases.deletePatientGuardian("clinic", "link", "actor")).toEqual({ ok: true });
    expect(fake.calls).toEqual([
      ["deletePatientGuardian", "clinic", "link"],
      ["revokeReleases", "clinic", "patient", "guardian", "actor"],
    ]);
    fake.calls.length = 0;
    fake.setResult({ rows: [], rowCount: 0 });
    await expect(useCases.get("clinic", "missing")).rejects.toThrow("not_found");
    await expect(useCases.deletePatientGuardian("clinic", "missing", "actor")).rejects.toThrow("not_found");
    expect(fake.calls.map(([name]) => name)).toEqual(["get", "deletePatientGuardian"]);
  });
});
