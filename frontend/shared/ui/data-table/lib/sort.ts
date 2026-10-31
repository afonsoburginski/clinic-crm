/**
 * Ordenação em memória: texto em pt-BR (acento e caixa não mudam a ordem, números dentro do texto contam como
 * número), números e datas pelo valor; vazio (`null`, `undefined`, `""`) sempre por último em ordem crescente.
 */
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })

const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value))

export function compareValues(a: unknown, b: unknown): number {
  const [emptyA, emptyB] = [isEmpty(a), isEmpty(b)]
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b)
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return collator.compare(String(a), String(b))
}
