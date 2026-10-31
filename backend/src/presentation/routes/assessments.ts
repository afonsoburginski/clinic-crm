import { Hono } from "hono";

import type { AssessmentUseCases } from "@/application/use-cases/assessments";
import { assessments } from "@/presentation/composition/assessments";
import { actorOf, handle, param } from "@/presentation/routes/context";
import { clinic, type ApiEnv } from "@/presentation/routes/shared";

export function createAssessmentsRouter({ queries, commands }: AssessmentUseCases) {
  const app = new Hono<ApiEnv>();
  app.get(
    "/api/v1/assessments",
    handle(async (c) =>
      c.json({
        items: await queries.listAssessments({
          clinicId: clinic()!,
          actor: actorOf(c),
          filters: {
            patientId: c.req.query("patientId"),
            status: c.req.query("status"),
            from: c.req.query("from"),
            to: c.req.query("to"),
          },
        }),
      }),
    ),
  );
  app.post(
    "/api/v1/assessments",
    handle(async (c) =>
      c.json(await commands.createAssessment({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }), 201),
    ),
  );
  app.get(
    "/api/v1/assessments/:id",
    handle(async (c) =>
      c.json(await queries.getAssessment({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") })),
    ),
  );
  app.patch(
    "/api/v1/assessments/:id",
    handle(async (c) =>
      c.json(
        await commands.updateAssessment({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/assessments/:id/stages",
    handle(async (c) =>
      c.json(
        await commands.advanceStage({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/assessments/:id/interpretations",
    handle(async (c) =>
      c.json(
        await commands.addInterpretation({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/assessments/:id/complete",
    handle(async (c) => {
      await c.req.json(); // complete takes no input, but a malformed body has always been rejected
      return c.json(await commands.complete({ clinicId: clinic()!, actor: actorOf(c), id: param(c, "id") }));
    }),
  );
  app.post(
    "/api/v1/assessments/:id/cancel",
    handle(async (c) =>
      c.json(
        await commands.cancel({
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

export const assessmentsRouter = createAssessmentsRouter(assessments);
