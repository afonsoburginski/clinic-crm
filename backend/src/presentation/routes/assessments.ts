import { Hono } from "hono";

import { registerResource, registerActions, type ApiEnv } from "./shared";
const app = new Hono<ApiEnv>();
registerResource(app, "assessments", "assessment");
registerActions(app, [
  ["assessments/:id/stages", "assessment", "stages"],
  ["assessments/:id/interpretations", "assessment", "interpretations"],
  ["assessments/:id/complete", "assessment", "complete"],
  ["assessments/:id/cancel", "assessment", "cancel"],
]);
export const assessmentsRouter = app;
