import { createAuth } from "@/application/auth"
import { postgresAuthSessions } from "@/infrastructure/postgres/repositories/auth-sessions"
import { postgresUserDirectory } from "@/infrastructure/postgres/repositories/users"

export const auth = createAuth({
  directory: postgresUserDirectory,
  sessions: postgresAuthSessions,
  env: () => ({
    secret: Bun.env.AUTH_SESSION_SECRET,
    usersJson: Bun.env.AUTH_USERS_JSON,
    clinicId: Bun.env.CLINIC_ID,
  }),
})
