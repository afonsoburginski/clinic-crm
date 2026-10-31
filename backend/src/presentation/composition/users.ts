import type { PasswordHasher } from "@/application/ports/users"
import { createUserUseCases } from "@/application/use-cases/users"
import { postgresUserRepository } from "@/infrastructure/postgres/repositories/users"

/** Bun's default password hash (argon2id); login verifies it, and also the bcrypt hashes provisioned earlier. */
const bunPasswordHasher: PasswordHasher = { hash: (password) => Bun.password.hash(password) }

export const users = createUserUseCases(postgresUserRepository, bunPasswordHasher)
