"use client"

import ReactBitsCountUp from "@/components/react-bits/count-up"

/** Número animado — React Bits CountUp com formatação pt-BR. */
export function CountUp({ to, suffix = "", duration = 1 }: { to: number; suffix?: string; duration?: number }) {
  return (
    <ReactBitsCountUp
      to={to}
      suffix={suffix}
      duration={duration}
      separator="."
      easing="expo"
      trigger="view"
      className="tabular-nums"
    />
  )
}
