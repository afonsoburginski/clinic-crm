"use client"

import { forwardRef } from "react"

import { HaloInput, HaloTextarea, type HaloInputProps, type HaloTextareaProps } from "@/components/ui/halo-input"

/** Átomo de entrada de texto do sistema — Cult UI Halo com a paleta da clínica. */
export const Input = forwardRef<HTMLInputElement, HaloInputProps>(function Input(props, ref) {
  return <HaloInput ref={ref} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, HaloTextareaProps>(function Textarea(props, ref) {
  return <HaloTextarea ref={ref} {...props} />
})
