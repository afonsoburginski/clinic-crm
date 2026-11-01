import type { Metadata } from "next"

import { ContactLine, LegalPage, type LegalSection } from "@/shared/ui/organisms/legal-page"

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description: "Como pedir a exclusão dos seus dados pessoais ou parar de receber mensagens da Villiére.",
  robots: { index: true, follow: true },
}

const SECTIONS: LegalSection[] = [
  {
    title: "1. Parar de receber mensagens",
    body: (
      <p>
        Responda <strong>SAIR</strong> a qualquer mensagem de WhatsApp da clínica. O consentimento é revogado e novos
        lembretes não são enviados. Seu atendimento continua normalmente.
      </p>
    ),
  },
  {
    title: "2. Pedir a exclusão dos seus dados",
    body: (
      <>
        <p>
          Para pedir a exclusão (art. 18, VI da LGPD), <ContactLine />, informando:
        </p>
        <ul>
          <li>nome completo do titular (paciente ou responsável) e telefone cadastrado;</li>
          <li>o que deseja excluir (tudo, ou apenas contato e mensagens);</li>
          <li>para menores, o nome do responsável legal que faz o pedido.</li>
        </ul>
        <p>Podemos pedir um comprovante simples de identidade para proteger você contra pedidos de terceiros.</p>
      </>
    ),
  },
  {
    title: "3. O que acontece depois",
    body: (
      <ul>
        <li>Respondemos ao pedido em até 15 dias.</li>
        <li>
          Excluímos ou anonimizamos os dados que não precisamos manter: contato, consentimentos, histórico de mensagens
          e preferências.
        </li>
        <li>Os acessos do titular ao sistema, quando houver, são encerrados.</li>
      </ul>
    ),
  },
  {
    title: "4. O que não pode ser excluído",
    body: (
      <p>
        Dados que a lei obriga a guardar permanecem pelo prazo legal, restritos a essa finalidade: o{" "}
        <strong>prontuário</strong> (mínimo de 20 anos, Lei nº 13.787/2018) e os registros fiscais e financeiros. Ao fim
        do prazo, eles são eliminados.
      </p>
    ),
  },
  {
    title: "5. Dados no WhatsApp",
    body: (
      <p>
        As mensagens também ficam no seu aparelho e no WhatsApp, que tratam esses dados pelas próprias políticas. Você
        pode apagar a conversa no seu aplicativo a qualquer momento.
      </p>
    ),
  },
  {
    title: "6. Reclamações",
    body: <p>Se não ficar satisfeito com a resposta, você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>,
  },
]

export default function DataDeletionPage() {
  return <LegalPage title="Exclusão de dados" updatedAt="1º de novembro de 2026" sections={SECTIONS} />
}
