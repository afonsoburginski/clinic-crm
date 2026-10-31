export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends DomainError {}

export class ForbiddenError extends DomainError {
  constructor(message = "Você não tem permissão para realizar esta ação.") {
    super(message)
  }
}

export class ValidationError extends DomainError {}

export interface ConflictDetail {
  type: string
  message: string
}

export class ConflictError extends DomainError {
  constructor(
    message: string,
    public readonly conflicts: ConflictDetail[] = [],
    public readonly suggestion?: { start: string; end: string }
  ) {
    super(message)
  }
}
