import type { HealthResponse } from "@contracts/index"
import { API_NAME, API_VERSION } from "@contracts/index"

export function getHealth(): HealthResponse {
  return { status: "ok", application: API_NAME, version: API_VERSION }
}
