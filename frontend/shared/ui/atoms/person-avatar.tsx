import { cn } from "@/lib/utils"
import { initials } from "@/shared/lib/format"

import { PRO_BG } from "./pro-color"

export function PersonAvatar({
  name,
  colorIndex,
  size = "md",
  className,
}: {
  name: string
  colorIndex?: number
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium",
        colorIndex === undefined ? "bg-secondary text-secondary-foreground" : cn(PRO_BG[colorIndex % 6], "text-primary-foreground"),
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-14 text-base",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}
