import { Hono, type Context } from "hono"

import type { FinancialReportUseCases } from "@/application/use-cases/financial-report"
import type { QuerySource } from "@/domain/financial-report"
import { financialReport } from "@/presentation/composition/financial-report"
import { actorOf, handle } from "@/presentation/routes/context"
import { clinic, type ApiEnv } from "@/presentation/routes/shared"

const sourceOf = (c: Context<ApiEnv>): QuerySource => ({
  one: (name) => c.req.query(name),
  many: (name) => c.req.queries(name) ?? [],
})

/**
 * Read-only views over the financial entries. Mounted before the entries router: `/entries/search`
 * would otherwise be taken for `/entries/:id`.
 */
export function createFinancialReportRouter({ queries, commands }: FinancialReportUseCases) {
  const app = new Hono<ApiEnv>()
  const inputOf = (c: Context<ApiEnv>) => ({ clinicId: clinic()!, actor: actorOf(c), query: sourceOf(c) })
  app.get("/api/v1/financial/report", handle(async (c) => c.json(await queries.report(inputOf(c)))))
  app.get("/api/v1/financial/entries/search", handle(async (c) => c.json(await queries.search(inputOf(c)))))
  app.get("/api/v1/financial/export", handle(async (c) => c.json(await commands.exportEntries(inputOf(c)))))
  return app
}

export const financialReportRouter = createFinancialReportRouter(financialReport)
