import { StatePill } from "../atoms/state-pill"

/** Rótulo fixo das áreas de demonstração (prontuário, avaliações, ABA, financeiro, documentos). */
export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/50 px-4 py-3">
      <StatePill tone="warning" className="mt-0.5 shrink-0 tracking-wide">
        DEMO
      </StatePill>
      <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
        {children ??
          "Interface de demonstração: os dados ficam só neste navegador (localStorage) e nada é enviado a um servidor. Não registre informações reais de pacientes."}
      </p>
    </div>
  )
}
