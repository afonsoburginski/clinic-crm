import type { Metadata } from "next"

import { ContactLine, LegalPage, type LegalSection } from "@/shared/ui/organisms/legal-page"

export const metadata: Metadata = {
  title: "Termos de Serviço",
  description: "Condições de uso do sistema Villiére pela equipe e pelos usuários autorizados da clínica.",
  robots: { index: true, follow: true },
}

const SECTIONS: LegalSection[] = [
  {
    title: "1. Aceite",
    body: (
      <p>
        Ao acessar o sistema Villiére ou receber comunicações da clínica por ele (como lembretes de consulta por
        WhatsApp), você concorda com estes termos e com a Política de Privacidade.
      </p>
    ),
  },
  {
    title: "2. O que é o serviço",
    body: (
      <p>
        O Villiére é o sistema de gestão da clínica: agenda, cadastro de pacientes e responsáveis, prontuário,
        avaliações, financeiro, documentos e comunicação com pacientes. O acesso ao painel é restrito à equipe
        autorizada pela clínica.
      </p>
    ),
  },
  {
    title: "3. Contas e acesso",
    body: (
      <ul>
        <li>A conta é pessoal e intransferível; a senha não deve ser compartilhada.</li>
        <li>Cada usuário recebe um papel com permissões definidas pela administração da clínica.</li>
        <li>A clínica pode suspender ou revogar o acesso a qualquer momento, e as sessões ativas são encerradas.</li>
        <li>Ações sensíveis ficam registradas em trilha de auditoria.</li>
      </ul>
    ),
  },
  {
    title: "4. Uso adequado",
    body: (
      <ul>
        <li>Usar os dados apenas para as finalidades do atendimento e da gestão da clínica.</li>
        <li>Respeitar o sigilo profissional e a LGPD; não copiar nem divulgar dados de pacientes sem base legal.</li>
        <li>Não tentar burlar controles de acesso, testar vulnerabilidades sem autorização nem sobrecarregar o sistema.</li>
        <li>Manter os registros verdadeiros e atualizados; o prontuário é responsabilidade do profissional que o assina.</li>
      </ul>
    ),
  },
  {
    title: "5. Mensagens por WhatsApp",
    body: (
      <p>
        Os lembretes de consulta são enviados somente a quem consentiu, pelo número comercial da clínica. As mensagens
        são informativas e não substituem contato clínico; em urgência, procure atendimento de emergência. Para parar
        de receber, responda <strong>SAIR</strong> ou peça à recepção.
      </p>
    ),
  },
  {
    title: "6. Disponibilidade e limites",
    body: (
      <p>
        Buscamos manter o sistema disponível, mas ele pode ter interrupções para manutenção ou por falhas de terceiros
        (hospedagem, provedores de mensagens). A clínica não responde por indisponibilidade de serviços de terceiros
        fora do seu controle, nem por uso indevido de credenciais pelo próprio usuário.
      </p>
    ),
  },
  {
    title: "7. Propriedade intelectual",
    body: (
      <p>
        O software, a marca Villiére e o conteúdo do sistema pertencem aos seus titulares. Os dados inseridos pela
        clínica continuam sendo da clínica e dos seus titulares, nos termos da LGPD.
      </p>
    ),
  },
  {
    title: "8. Alterações e encerramento",
    body: (
      <p>
        Estes termos podem ser atualizados; o uso após a mudança indica concordância. O encerramento da conta não apaga
        dados sujeitos à guarda legal, como o prontuário.
      </p>
    ),
  },
  {
    title: "9. Lei aplicável e contato",
    body: (
      <p>
        Estes termos seguem a legislação brasileira. Para dúvidas, <ContactLine />.
      </p>
    ),
  },
]

export default function TermsPage() {
  return <LegalPage title="Termos de Serviço" updatedAt="1º de novembro de 2026" sections={SECTIONS} />
}
