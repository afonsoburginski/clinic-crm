"use client"

import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"

import { cn } from "@/lib/utils"

const DURATION_MS = 180
const EASING = "cubic-bezier(0.2, 0, 0, 1)"
const KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translate3d(0, 6px, 0)" },
  { opacity: 1, transform: "translate3d(0, 0, 0)" },
]

// Estado só do navegador: marca que o documento já renderizou uma tela. A carga completa não anima.
let documentRendered = false

/**
 * Transição universal entre telas, no ponto global do App Router (layout do painel e do login).
 *
 * Roda no commit da nova rota (`usePathname` muda junto com a árvore), então a tela nova
 * entra no primeiro frame, sem esperar saída da anterior: nenhum atraso perceptível.
 * Usa Web Animations API (sem remontar a árvore, sem markup diferente entre servidor e cliente).
 * Fallbacks: sem `Element.animate` ou com `prefers-reduced-motion: reduce` a troca é instantânea.
 */
export function RouteTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const lastPathname = useRef<string | null>(null)

  useLayoutEffect(() => {
    const isMount = lastPathname.current === null
    const navigated = !isMount && lastPathname.current !== pathname
    lastPathname.current = pathname

    const shouldAnimate = navigated || (isMount && documentRendered)
    documentRendered = true
    if (!shouldAnimate) return

    const element = ref.current
    if (!element || typeof element.animate !== "function") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    element.getAnimations?.().forEach((animation) => animation.cancel())
    element.animate(KEYFRAMES, { duration: DURATION_MS, easing: EASING })
  }, [pathname])

  return (
    <div ref={ref} data-slot="route-transition" className={cn(className)}>
      {children}
    </div>
  )
}
