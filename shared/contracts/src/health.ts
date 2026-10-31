export const API_NAME = "clinic-api" as const
export const API_VERSION = "v1" as const

export interface HealthResponse {
  readonly status: "ok"
  readonly application: typeof API_NAME
  readonly version: typeof API_VERSION
}
