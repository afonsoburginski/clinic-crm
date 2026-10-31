import { cn } from "@/lib/utils"

export const PRO_BG = ["bg-pro-0", "bg-pro-1", "bg-pro-2", "bg-pro-3", "bg-pro-4", "bg-pro-5"]

/** Superfície tingida com a cor do profissional (eventos da agenda). */
export const PRO_SURFACE = [
  "bg-pro-0/14 hover:bg-pro-0/22 ring-pro-0/35",
  "bg-pro-1/14 hover:bg-pro-1/22 ring-pro-1/35",
  "bg-pro-2/14 hover:bg-pro-2/22 ring-pro-2/35",
  "bg-pro-3/14 hover:bg-pro-3/22 ring-pro-3/35",
  "bg-pro-4/14 hover:bg-pro-4/22 ring-pro-4/35",
  "bg-pro-5/14 hover:bg-pro-5/22 ring-pro-5/35",
]

export function ProDot({ colorIndex, className }: { colorIndex: number; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", PRO_BG[colorIndex % 6], className)} />
}
