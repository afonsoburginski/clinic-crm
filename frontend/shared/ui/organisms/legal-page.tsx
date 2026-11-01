import Link from "next/link"

export interface LegalSection {
  title: string
  body: React.ReactNode
}

/** Encarregado pelo tratamento de dados pessoais (LGPD): canal público de contato do titular. */
export const PRIVACY_CONTACT_EMAIL = "afonsoburginski@gmail.com"

export function ContactLine() {
  return (
    <>
      fale com a recepção da clínica ou escreva ao responsável pela proteção de dados (LGPD) em{" "}
      <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
        {PRIVACY_CONTACT_EMAIL}
      </a>
    </>
  )
}

const LEGAL_LINKS = [
  { href: "/politica-de-privacidade", label: "Política de Privacidade" },
  { href: "/termos-de-servico", label: "Termos de Serviço" },
  { href: "/exclusao-de-dados", label: "Exclusão de dados" },
]

export function LegalPage({ title, updatedAt, sections }: { title: string; updatedAt: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
        <Link href="/entrar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Voltar
        </Link>
        <header className="mt-6 border-b border-border pb-6">
          <p className="text-sm font-medium text-primary">Villiére</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        </header>
        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
              <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2 [&_strong]:font-semibold [&_strong]:text-foreground">
                {section.body}
              </div>
            </section>
          ))}
        </div>
        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
