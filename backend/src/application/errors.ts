/**
 * A use-case failure that carries a user-facing message. `message` stays the machine code the HTTP layer
 * maps to a status (`validation`, `conflict`, `not_found`, `forbidden`); `detail` is the pt-BR text it returns.
 */
export class DomainError extends Error {
  constructor(
    code: "validation" | "conflict" | "not_found" | "forbidden",
    readonly detail: string,
  ) {
    super(code)
    this.name = "DomainError"
  }
}
