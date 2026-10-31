import { Hono } from "hono";

import type { AbaUseCases } from "@/application/use-cases/aba";
import { aba } from "@/presentation/composition/aba";
import { actorOf, filtersOf, handle, param } from "@/presentation/routes/context";
import { clinic, type ApiEnv } from "@/presentation/routes/shared";

export function createAbaRouter({ queries, commands }: AbaUseCases) {
  const app = new Hono<ApiEnv>();
  app.get(
    "/api/v1/aba/plans/:id/goals",
    handle(async (c) =>
      c.json({ items: await queries.listPlanGoals({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }) }),
    ),
  );
  app.patch(
    "/api/v1/aba/plans/:id/goals/:goalId",
    handle(async (c) =>
      c.json(
        await commands.updateGoal({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          goalId: param(c, "goalId"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.get(
    "/api/v1/aba/plans",
    handle(async (c) =>
      c.json({ items: await queries.listPlans({ clinicId: clinic()!, actor: actorOf(c), filters: filtersOf(c) }) }),
    ),
  );
  app.post(
    "/api/v1/aba/plans",
    handle(async (c) =>
      c.json(await commands.createPlan({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }), 201),
    ),
  );
  app.get(
    "/api/v1/aba/plans/:id",
    handle(async (c) => c.json(await queries.getPlan({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }))),
  );
  app.patch(
    "/api/v1/aba/plans/:id",
    handle(async (c) =>
      c.json(
        await commands.updatePlan({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.get(
    "/api/v1/aba/sessions",
    handle(async (c) =>
      c.json({ items: await queries.listSessions({ clinicId: clinic()!, actor: actorOf(c), filters: filtersOf(c) }) }),
    ),
  );
  app.post(
    "/api/v1/aba/sessions",
    handle(async (c) =>
      c.json(await commands.createSession({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }), 201),
    ),
  );
  app.get(
    "/api/v1/aba/sessions/:id",
    handle(async (c) =>
      c.json(await queries.getSession({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") })),
    ),
  );
  app.patch(
    "/api/v1/aba/sessions/:id",
    handle(async (c) =>
      c.json(
        await commands.updateSession({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/aba/plans/:id/activate",
    handle(async (c) => {
      await c.req.json(); // activate takes no input, but a malformed body has always been rejected
      return c.json(await commands.activatePlan({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }));
    }),
  );
  app.post(
    "/api/v1/aba/plans/:id/close",
    handle(async (c) => {
      await c.req.json(); // close takes no input, but a malformed body has always been rejected
      return c.json(await commands.closePlan({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }));
    }),
  );
  app.post(
    "/api/v1/aba/plans/:id/goals",
    handle(async (c) =>
      c.json(
        await commands.addGoal({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/aba/sessions/:id/void",
    handle(async (c) =>
      c.json(
        await commands.voidSession({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  return app;
}

export const abaRouter = createAbaRouter(aba);
