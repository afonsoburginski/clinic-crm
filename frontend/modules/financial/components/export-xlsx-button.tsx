"use client"

import { Download, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { FinancialQueryFilters } from "@/shared/api/api"
import { PermissionGate } from "@/shared/ui/molecules/permission-gate"

import { useExportFinancial } from "../queries"

/** RF-FIN-008: exporta o filtro atual; só aparece com `finance:export` (a API também recusa quem não tem). */
export function ExportXlsxButton({ filters }: { filters: FinancialQueryFilters }) {
  const exporter = useExportFinancial()
  return (
    <PermissionGate permission="finance:export">
      <Button variant="outline" onClick={() => exporter.mutate(filters)} disabled={exporter.isPending} aria-busy={exporter.isPending}>
        {exporter.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        {exporter.isPending ? "Exportando…" : "Exportar XLSX"}
      </Button>
    </PermissionGate>
  )
}
