import Image from "next/image"

import { cn } from "@/lib/utils"

export function BrandMark({
  compact = false,
  className,
  subtitleClassName,
}: {
  compact?: boolean
  className?: string
  subtitleClassName?: string
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
        <Image src="/clinic-logo.png" alt="" width={40} height={40} className="size-full object-contain" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="font-serif text-[15px] font-semibold tracking-tight">Villiére</span>
          <span className={cn("text-[11px] text-muted-foreground", subtitleClassName)}>
            Desenvolvimento infantil
          </span>
        </span>
      )}
    </span>
  )
}
