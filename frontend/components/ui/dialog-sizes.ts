/**
 * Contrato de tamanho de dialogs, alertdialogs e sheets (ver `specs/ui/dialogs.md`).
 * Strings completas e estáticas: o Tailwind só gera as classes que aparecem literalmente no código.
 * Larguras são sempre `min(92vw, X)` (nunca estouram a tela) e a altura máxima é 90 % da viewport
 * dinâmica; o corpo (`DialogBody`/`SheetBody`) rola e header/footer ficam fixos.
 */

export const DIALOG_SIZE_NAMES = ["sm", "md", "lg", "xl"] as const
export type DialogSize = (typeof DIALOG_SIZE_NAMES)[number]

/** Abaixo de `sm` o dialog encosta na base (bottom sheet); de `sm` em diante vale a largura da variante. */
export const DIALOG_WIDTHS: Record<DialogSize, string> = {
  sm: "sm:w-[min(92vw,480px)]",
  md: "sm:w-[min(92vw,720px)]",
  lg: "sm:w-[min(92vw,960px)]",
  xl: "sm:w-[min(92vw,1100px)]",
}

/** Piso de largura que nunca passa de 92vw (telas de 320px). */
export const DIALOG_MIN_WIDTH = "sm:min-w-[min(92vw,20rem)]"

export const DIALOG_MAX_HEIGHT = "sm:max-h-[90dvh]"
/** Mobile (bottom sheet): sobra uma faixa do scrim no topo. */
export const DIALOG_MAX_HEIGHT_MOBILE = "max-h-[calc(100dvh-1rem)]"

/** Formulários grandes não "pulam" de altura entre carregando/pronto. */
export const DIALOG_MIN_HEIGHTS: Record<DialogSize, string> = {
  sm: "",
  md: "",
  lg: "sm:min-h-[min(50dvh,24rem)]",
  xl: "sm:min-h-[min(60dvh,28rem)]",
}

export const DIALOG_SIZE_CLASSES: Record<DialogSize, string> = {
  sm: `${DIALOG_WIDTHS.sm} ${DIALOG_MIN_HEIGHTS.sm}`.trim(),
  md: `${DIALOG_WIDTHS.md} ${DIALOG_MIN_HEIGHTS.md}`.trim(),
  lg: `${DIALOG_WIDTHS.lg} ${DIALOG_MIN_HEIGHTS.lg}`,
  xl: `${DIALOG_WIDTHS.xl} ${DIALOG_MIN_HEIGHTS.xl}`,
}

/** AlertDialog/ConfirmDialog: sempre centrado e curto; `default` usa a largura `sm` dos dialogs. */
export const ALERT_DIALOG_SIZES = {
  default: "w-[min(92vw,480px)]",
  sm: "w-[min(92vw,20rem)]",
} as const

export const ALERT_DIALOG_MAX_HEIGHT = "max-h-[90dvh]"

export const SHEET_SIZE_NAMES = ["nav", "sm", "md", "lg"] as const
export type SheetSize = (typeof SHEET_SIZE_NAMES)[number]

/** Sheets laterais: largura por variante; `top`/`bottom` ocupam a largura toda e limitam só a altura. */
export const SHEET_WIDTHS: Record<SheetSize, string> = {
  nav: "data-[side=left]:w-[min(92vw,18rem)] data-[side=right]:w-[min(92vw,18rem)]",
  sm: "data-[side=left]:w-[min(92vw,384px)] data-[side=right]:w-[min(92vw,384px)]",
  md: "data-[side=left]:w-[min(92vw,448px)] data-[side=right]:w-[min(92vw,448px)]",
  lg: "data-[side=left]:w-[min(92vw,576px)] data-[side=right]:w-[min(92vw,576px)]",
}

export const SHEET_MAX_HEIGHT = "data-[side=bottom]:max-h-[90dvh] data-[side=top]:max-h-[90dvh]"
