import { Hono } from "hono";

import { listResource } from "../../application/resources";

import { clinic, run, registerResource, registerActions, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
app.get(
  "/api/v1/financial/summary",
  run(async (c) => {
    const items = await listResource(clinic()!, "financial-entry");
    return c.json({
      items,
      totals: items.reduce((a: any, x: any) => {
        if (x.status !== "cancelled") a[x.type] = (a[x.type] ?? 0) + x.amountCents;
        return a;
      }, {}),
    });
  }),
);
registerResource(app, "financial/entries", "financial-entry");
registerActions(app, [
  ["financial/entries/:id/payments", "financial-entry", "payments"],
  ["financial/entries/:id/cancel", "financial-entry", "cancel"],
  ["financial/payments/:id/reverse", "financial-payment", "reverse"],
]);
export const financialRouter = app;
