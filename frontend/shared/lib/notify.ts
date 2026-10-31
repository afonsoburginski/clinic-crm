import { toast } from "sonner"

import { ConflictError, DomainError } from "@/domain/errors"

export function errorMessage(error: unknown) {
  if (error instanceof DomainError) return error.message
  return "Algo deu errado. Tente novamente em instantes."
}

export function notifyError(error: unknown) {
  if (error instanceof ConflictError) {
    toast.error(error.message, { description: error.conflicts.map((c) => c.message).join(" · ") })
    return
  }
  toast.error(errorMessage(error))
}

export const notifySuccess = (message: string, description?: string) => toast.success(message, { description })
