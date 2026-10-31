import { describe, expect, it } from "bun:test";
import { app } from "@/presentation/app";

describe("API routers", () => {
  it("applies authentication to protected routers without a database", async () => {
    const previousClinicId = Bun.env.CLINIC_ID;
    Bun.env.CLINIC_ID = "test-clinic";
    try {
      for (const path of [
        "/api/v1/patients", "/api/v1/specialties", "/api/v1/appointments", "/api/v1/clinical-records",
        "/api/v1/assessments", "/api/v1/aba/plans", "/api/v1/financial/entries", "/api/v1/documents",
        "/api/v1/dashboard/summary",
      ]) {
        const response = await app.request(path);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "unauthorized" } });
      }
    } finally {
      if (previousClinicId === undefined) delete Bun.env.CLINIC_ID;
      else Bun.env.CLINIC_ID = previousClinicId;
    }
  });
});
