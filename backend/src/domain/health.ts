import type { HealthResponse } from "../../../shared/contracts/src/index"
import { API_NAME, API_VERSION } from "../../../shared/contracts/src/index"

export function getHealth(): HealthResponse {
  return { status: "ok", application: API_NAME, version: API_VERSION }
}
