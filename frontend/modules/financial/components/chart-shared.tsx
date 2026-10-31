import { formatCurrency } from "@/shared/lib/format"

/** Linha do tooltip dos gráficos: bolinha da série, nome e valor em reais (o tooltip padrão formata só o número). */
export function moneyTooltipRow(value: unknown, name: unknown, item: { color?: string; payload?: { fill?: string } }) {
  return (
    <>
      <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.payload?.fill ?? item.color }} />
      <span className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{String(name)}</span>
        <span className="font-mono font-medium text-foreground tabular-nums">{formatCurrency(Number(value))}</span>
      </span>
    </>
  )
}

/**
 * Tabela equivalente do gráfico, só para leitores de tela: o gráfico fica `aria-hidden` (SVG sem texto útil)
 * e esta tabela entrega os mesmos números.
 */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) =>
              cellIndex === 0 ? (
                <th key={cellIndex} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={cellIndex}>{cell}</td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
