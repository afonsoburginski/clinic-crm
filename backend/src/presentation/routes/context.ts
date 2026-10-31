import type { Context } from "hono";

import type { Actor } from "@/application/ports/patient-access";
import { run, type ApiEnv } from "@/presentation/routes/shared";

export const handle = (fn: (c: Context<ApiEnv>) => Promise<Response>) => run(fn);

// The route patterns always carry the segment.
export const param = (c: Context<ApiEnv>, name: string): string => c.req.param(name)!;

/** The list filters every resource collection accepts as query parameters. */
export const filtersOf = (c: Context<ApiEnv>) => ({
  patientId: c.req.query("patientId"),
  status: c.req.query("status"),
  from: c.req.query("from"),
  to: c.req.query("to"),
});

export function actorOf(c: Context<ApiEnv>): Actor {
  const auth = c.get("auth");
  if (!auth?.userId) throw new Error("unauthorized");
  return { userId: auth.userId, roles: auth.user.roles, professionalId: auth.user.professionalId };
}
