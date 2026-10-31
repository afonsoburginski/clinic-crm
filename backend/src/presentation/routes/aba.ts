import { Hono } from "hono";

import { actionResource, getResource, listResource } from "../../application/resources";
import { session } from "../../application/auth";
import { clinic, run, assertProfessionalPatientAccess, registerResource, registerActions, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
app.get(
  "/api/v1/aba/plans/:id/goals",
  run(async (c) => {
    const user = c.get("auth").user;
    const plan = await getResource(clinic()!, "aba-plan", c.req.param("id"));
    await assertProfessionalPatientAccess(plan.patientId, user);
    const sessions = (
      await listResource(clinic()!, "aba-session", { patientId: plan.patientId, professionalId: user.professionalId })
    )
      .filter((s: any) => !s.voided && (!s.planId || s.planId === plan.id))
      .sort((a: any, b: any) => String(b.date ?? b.createdAt ?? "").localeCompare(String(a.date ?? a.createdAt ?? "")));
    const goals = (plan.goals ?? []).map((g: any) => {
      const samples = sessions.flatMap((s: any) =>
        (Array.isArray(s.measures) ? s.measures : [])
          .filter((m: any) => m.goalId === g.id && m.voided !== true && Number.isFinite(m.percent))
          .map((m: any) => ({ percent: m.percent, at: s.date ?? s.createdAt })),
      );
      const streak = samples.reduce(
        (n: number, m: any) => (n === samples.indexOf(m) && m.percent >= g.targetPercent ? n + 1 : n),
        0,
      );
      const progress = samples.length ? Math.round(samples[0].percent) : 0;
      const completed =
        samples.slice(0, g.consecutiveSessions ?? 1).length === (g.consecutiveSessions ?? 1) &&
        samples.slice(0, g.consecutiveSessions ?? 1).every((m: any) => m.percent >= g.targetPercent);
      return { ...g, progress, status: completed ? "completed" : g.status };
    });
    return c.json({ items: goals });
  }),
);
app.patch(
  "/api/v1/aba/plans/:id/goals/:goalId",
  run(async (c) => {
    const auth = c.get("auth");
    const plan = await getResource(clinic()!, "aba-plan", c.req.param("id"));
    await assertProfessionalPatientAccess(plan.patientId, auth.user);
    return c.json(
      await actionResource(
        clinic()!,
        "aba-plan",
        c.req.param("id"),
        "goal",
        { ...(await c.req.json()), goalId: c.req.param("goalId") },
        auth.userId,
      ),
    );
  }),
);
registerResource(app, "aba/plans", "aba-plan");
registerResource(app, "aba/sessions", "aba-session");
registerActions(app, [
  ["aba/plans/:id/activate", "aba-plan", "activate"],
  ["aba/plans/:id/close", "aba-plan", "close"],
  ["aba/plans/:id/goals", "aba-plan", "goals"],
  ["aba/sessions/:id/void", "aba-session", "void"],
]);
export const abaRouter = app;
