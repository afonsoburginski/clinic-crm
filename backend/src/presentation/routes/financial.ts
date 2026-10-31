import { Hono } from "hono";

import type { FinancialUseCases } from "@/application/use-cases/financial";
import { financial } from "@/presentation/composition/financial";
import { actorOf, filtersOf, handle, param } from "@/presentation/routes/context";
import { clinic, type ApiEnv } from "@/presentation/routes/shared";

export function createFinancialRouter({ queries, commands }: FinancialUseCases) {
  const app = new Hono<ApiEnv>();
  app.get(
    "/api/v1/financial/summary",
    handle(async (c) => c.json(await queries.summary({ clinicId: clinic()! }))),
  );
  app.get(
    "/api/v1/financial/entries",
    handle(async (c) =>
      c.json({ items: await queries.listEntries({ clinicId: clinic()!, filters: filtersOf(c) }) }),
    ),
  );
  app.post(
    "/api/v1/financial/entries",
    handle(async (c) =>
      c.json(await commands.createEntry({ clinicId: clinic()!, actor: actorOf(c), body: await c.req.json() }), 201),
    ),
  );
  app.get(
    "/api/v1/financial/entries/:id",
    handle(async (c) => c.json(await queries.getEntry({ clinicId: clinic()!, id: param(c, "id") }))),
  );
  app.patch(
    "/api/v1/financial/entries/:id",
    handle(async (c) =>
      c.json(
        await commands.updateEntry({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/financial/entries/:id/payments",
    handle(async (c) =>
      c.json(
        await commands.registerPayment({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/financial/entries/:id/cancel",
    handle(async (c) =>
      c.json(
        await commands.cancelEntry({
          clinicId: clinic()!,
          actor: actorOf(c),
          id: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  app.post(
    "/api/v1/financial/payments/:id/reverse",
    handle(async (c) =>
      c.json(
        await commands.reversePayment({
          clinicId: clinic()!,
          actor: actorOf(c),
          paymentId: param(c, "id"),
          body: await c.req.json(),
        }),
      ),
    ),
  );
  return app;
}

export const financialRouter = createFinancialRouter(financial);
