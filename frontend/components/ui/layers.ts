/**
 * Escala única de camadas (z-index) das superfícies flutuantes. Strings estáticas para o Tailwind.
 *
 *   conteúdo fixo da página (topbar, toolbar) … z-20/z-30
 *   scrim + dialog + alertdialog + sheet ....... z-50
 *   popover, select, dropdown, combobox ........ z-60  (abrem por cima de dialogs)
 *   tooltip .................................... z-70
 *   toast (sonner) ............................. acima de tudo (z-index próprio da lib)
 *
 * Popovers dentro de dialogs usam o portal do base-ui, que fica na mesma árvore flutuante do dialog:
 * clicar neles não fecha o dialog e o foco volta ao gatilho.
 */
export const LAYERS = {
  dialog: "z-50",
  popover: "z-60",
  tooltip: "z-70",
} as const

export const LAYER_LEVELS = { dialog: 50, popover: 60, tooltip: 70 } as const
