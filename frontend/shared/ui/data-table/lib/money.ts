/** Moeda em pt-BR para os campos de faixa: o estado guarda centavos inteiros; o texto usa vírgula decimal. */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatMoney = (cents: number) => brl.format(cents / 100)

/** Texto para o campo editável: `123456` → `1.234,56` (sem símbolo, para o usuário só digitar o número). */
export const formatMoneyInput = (cents: number | undefined) => (cents === undefined ? "" : plain.format(cents / 100))

/**
 * `1.234,56`, `1234,5`, `R$ 12`, `12` → centavos. Aceita ponto como milhar e vírgula como decimal;
 * mais de 2 casas decimais, negativo ou texto livre são recusados (`null`). Vazio é `undefined` (sem limite).
 */
export function parseMoneyToCents(text: string): number | null | undefined {
  const cleaned = text.replace(/R\$/gi, "").replace(/\s/g, "")
  if (!cleaned) return undefined
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ""] = cleaned.replace(/\./g, "").split(",")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(cents) ? cents : null
}
