import { Hono } from "hono"
import { hasPermission } from "@/application/auth"
import { schedulingUseCases } from "@/application/use-cases/scheduling"
import { transitionAppointment } from "@/application/use-cases/transition-appointment"
import type { SchedulingRepository, AppointmentData } from "@/application/ports/scheduling"
import type { AppointmentTransitionRepository } from "@/application/ports/appointment-transitions"
import { clinic, run, type ApiEnv } from "@/presentation/routes/shared"

export function createSchedulingRouter(repository: SchedulingRepository, transitionRepository: AppointmentTransitionRepository) {
  const app = new Hono<ApiEnv>()
  const scheduling = schedulingUseCases(repository)
  app.get("/api/v1/appointments", run(async (c) => {
    const user = c.get("auth").user
    const own = user.roles.includes("professional") && !hasPermission(user, "appointments:read") ? user.professionalId : undefined
    return c.json({ items: await scheduling.list(clinic()!, { from: c.req.query("from"), to: c.req.query("to"), professional: own ?? c.req.query("professionalId"), status: c.req.query("status"), patient: c.req.query("patientId") }) })
  }))
  app.post("/api/v1/appointments", run(async (c) => {
    const body: AppointmentData = await c.req.json()
    return c.json(await scheduling.create(clinic()!, { ...body, actorId: c.get("auth").userId }), 201)
  }))
  // Must be registered before "/api/v1/appointments/:id" — Hono matches routes in order and
  // "suggestions" would otherwise be swallowed as the :id param, making this route dead code.
  app.get("/api/v1/appointments/suggestions", run(async (c) => c.json({ items: await scheduling.suggestions(clinic()!, c.req.query("start"), c.req.query("duration"), c.req.query("professionalId"), c.req.query("roomId")) })))
  app.get("/api/v1/appointments/:id", run(async (c) => {
    const user = c.get("auth").user
    const own = user.roles.includes("professional") && !hasPermission(user, "appointments:read") ? user.professionalId : undefined
    return c.json(await scheduling.get(clinic()!, c.req.param("id"), own))
  }))
  app.patch("/api/v1/appointments/:id", run(async (c) => {
    const body: AppointmentData = await c.req.json()
    return c.json(await scheduling.update(clinic()!, c.req.param("id"), body))
  }))
  app.get("/api/v1/appointments/:id/transitions", run(async (c) => c.json({ items: await scheduling.transitions(clinic()!, c.req.param("id")) })))
  app.post("/api/v1/appointments/:id/status", run(async (c) => {
    const body: { status: string } = await c.req.json()
    return c.json(await transitionAppointment(transitionRepository, clinic()!, c.req.param("id"), body.status))
  }))
  app.get("/api/v1/patients/:id/appointments", run(async (c) => c.json({ items: await scheduling.listForPatient(clinic()!, c.req.param("id")) })))
  return app
}
