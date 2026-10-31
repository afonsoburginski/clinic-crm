import { describe, expect, test } from "bun:test"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "@/infrastructure/postgres/schema"
import {
  activeAdminCountQuery,
  credentialsByEmailQuery,
  emailTakenQuery,
  listUsersQuery,
  rolePermissionsQuery,
  roleUserCountsQuery,
  userByIdQuery,
  userRolesQuery,
  type Executor,
} from "@/infrastructure/postgres/repositories/users"

/** No connection: the query builders only render SQL. */
const executor = drizzle.mock({ schema }) as unknown as Executor
const CLINIC = "11111111-1111-4111-8111-111111111111"

describe("user queries (SQL rendered by Drizzle)", () => {
  test("the administrator count only counts active users holding the admin role, per clinic", () => {
    const { sql, params } = activeAdminCountQuery(executor, CLINIC).toSQL()
    expect(sql).toContain('from "users" inner join "user_roles"')
    expect(sql).toContain('"users"."clinic_id" = $1')
    expect(sql).toContain('"users"."active" = $2')
    expect(sql).toContain('"user_roles"."role_key" = $3')
    expect(params).toEqual([CLINIC, true, "admin"])
  })

  test("credentials are looked up case-insensitively inside the clinic and never by e-mail alone", () => {
    const { sql, params } = credentialsByEmailQuery(executor, CLINIC, "  Ana@Clinica.COM ").toSQL()
    expect(sql).toContain('"users"."clinic_id" = $1')
    expect(sql).toContain('lower("users"."email") = $2')
    expect(sql).toContain('"password_hash"')
    expect(params.slice(0, 2)).toEqual([CLINIC, "ana@clinica.com"])
  })

  test("the listing never selects the password hash and is ordered by name", () => {
    const { sql } = listUsersQuery(executor, CLINIC).toSQL()
    expect(sql).not.toContain("password_hash")
    expect(sql).toContain('order by lower("users"."name")')
    expect(userByIdQuery(executor, CLINIC, "x").toSQL().sql).not.toContain("password_hash")
  })

  test("the e-mail check excludes the user being edited", () => {
    const own = emailTakenQuery(executor, CLINIC, "A@b.com", "user-1").toSQL()
    expect(own.sql).toContain('"users"."id" <> $3')
    expect(own.params.slice(0, 3)).toEqual([CLINIC, "a@b.com", "user-1"])
    expect(emailTakenQuery(executor, CLINIC, "a@b.com").toSQL().sql).not.toContain('<>')
  })

  test("role queries are scoped by clinic", () => {
    expect(rolePermissionsQuery(executor, CLINIC).toSQL().params).toEqual([CLINIC])
    expect(roleUserCountsQuery(executor, CLINIC).toSQL().sql).toContain('group by "user_roles"."role_key"')
    const some = userRolesQuery(executor, CLINIC, ["a", "b"]).toSQL()
    expect(some.sql).toContain('"user_roles"."user_id" in ($2, $3)')
    expect(userRolesQuery(executor, CLINIC).toSQL().sql).not.toContain(" in (")
  })
})
