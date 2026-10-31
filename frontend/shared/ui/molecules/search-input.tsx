"use client"

import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

import { Input } from "../atoms/text-input"

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  label = "Buscar",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  return (
    <Input
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      leadingSlot={<Search aria-hidden />}
      shellClassName={cn("w-full sm:max-w-xs", className)}
    />
  )
}
