import { Hono } from "hono";

import { query } from "../../infrastructure/database";

import { dashboard } from "../../application/resources";

import { clinic, run, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
app.get(
  "/api/v1/dashboard/summary",
  run(async (c) =>
    c.json(
      await dashboard(
        clinic()!,
        c.req.query("from") ?? new Date().toISOString().slice(0, 10),
        c.req.query("to") ?? new Date().toISOString().slice(0, 10),
      ),
    ),
  ),
);
export const dashboardRouter = app;
