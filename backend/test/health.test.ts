import { describe, expect, it } from "bun:test"
import { app } from "../src/presentation/app"

describe("GET /health", () => {
  it("returns the shared API health contract", async () => {
    const response = await app.request("/health")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "ok",
      "application": "clinic-api",
      version: "v1",
    })
  })
})
