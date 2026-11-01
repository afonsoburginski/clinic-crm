import type { Metadata } from "next"

import { ContactLine, LegalPage, type LegalSection } from "@/shared/ui/organisms/legal-page"

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Villiére trata os dados pessoais de pacientes, responsáveis e profissionais, conforme a LGPD.",
  robots: { index: true, follow: true },
}

const SECTIONS: LegalSection[] = [
  {
    title: "1. Quem somos",
    body: (
      <p>
        A Villiére é uma clínica de desenvolvimento infantil e atua como <strong>controladora</strong> dos dados pessoais
        tratados neste sistema, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018, “LGPD”).
      </p>
    ),
  },
  {
    title: "2. Quais dados tratamos",
    body: (
      <ul>
        <li>
          <strong>Cadastro do paciente e do responsável:</strong> nome, data de nascimento, documentos, telefone, e-mail,
          endereço e vínculo de responsabilidade.
        </li>
        <li>
          <strong>Agenda:</strong> consultas, profissionais, serviços, salas, presença e cancelamentos.
        </li>
        <li>
          <strong>Dados de saúde (sensíveis):</strong> prontuário, avaliações, planos terapêuticos, sessões e documentos
          clínicos.
        </li>
        <li>
          <strong>Financeiro:</strong> lançamentos, pagamentos e situação de cobrança.
        </li>
        <li>
          <strong>Acesso ao sistema (equipe):</strong> nome, e-mail, papel, registros de acesso e de auditoria.
        </li>
        <li>
          <strong>Mensagens:</strong> telefone, histórico de lembretes enviados e respostas aos botões (por exemplo,
          “Confirmar presença”).
        </li>
      </ul>
    ),
  },
  {
    title: "3. Para que usamos e em que base legal",
    body: (
      <ul>
        <li>
          <strong>Atendimento e tutela da saúde</strong> (art. 11, II, “f”): registrar e conduzir o cuidado, manter o
          prontuário e agendar consultas.
        </li>
        <li>
          <strong>Obrigação legal e regulatória</strong> (art. 7º, II): guarda de prontuário, documentos fiscais e
          atendimento a órgãos competentes.
        </li>
        <li>
          <strong>Execução de contrato</strong> (art. 7º, V): cobrança e gestão financeira dos serviços contratados.
        </li>
        <li>
          <strong>Consentimento</strong> (art. 7º, I e art. 11, I): envio de lembretes e comunicações por WhatsApp. Você
          pode revogá-lo a qualquer momento.
        </li>
        <li>
          <strong>Segurança e prevenção a fraudes</strong> (art. 7º, IX): controle de acesso e trilha de auditoria.
        </li>
      </ul>
    ),
  },
  {
    title: "4. Lembretes por WhatsApp",
    body: (
      <>
        <p>
          Com o seu consentimento, enviamos lembretes de consulta pelo número comercial da clínica, pela API oficial do
          WhatsApp Business (Meta). As mensagens podem ter botões de resposta rápida, como “Confirmar presença”,
          “Remarcar” e “Cancelar”; a resposta atualiza a sua consulta na agenda.
        </p>
        <p>
          Para parar de receber, responda <strong>SAIR</strong> a qualquer mensagem ou peça à recepção. O atendimento
          continua normalmente.
        </p>
      </>
    ),
  },
  {
    title: "5. Crianças e adolescentes",
    body: (
      <p>
        O tratamento de dados de crianças e adolescentes é feito no melhor interesse deles (art. 14 da LGPD), com o
        consentimento específico de pelo menos um dos pais ou do responsável legal, que é o nosso contato para
        comunicações e cobrança.
      </p>
    ),
  },
  {
    title: "6. Com quem compartilhamos",
    body: (
      <>
        <p>Não vendemos dados pessoais. O compartilhamento ocorre somente quando necessário:</p>
        <ul>
          <li>
            <strong>Operadores de infraestrutura:</strong> hospedagem do sistema e do banco de dados e envio de
            mensagens (Meta/WhatsApp), sob contrato e apenas para a finalidade descrita.
          </li>
          <li>
            <strong>Profissionais da clínica:</strong> acesso restrito ao que o seu papel exige. O prontuário é
            acessado por quem tem vínculo com o cuidado do paciente.
          </li>
          <li>
            <strong>Autoridades:</strong> quando houver obrigação legal ou ordem judicial.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "7. Por quanto tempo guardamos",
    body: (
      <p>
        O prontuário é mantido por no mínimo 20 anos após o último registro (Lei nº 13.787/2018). Dados financeiros e
        fiscais seguem os prazos legais. Demais dados são mantidos enquanto durar a relação com a clínica e eliminados
        ou anonimizados quando deixarem de ser necessários, ressalvadas as hipóteses de guarda obrigatória.
      </p>
    ),
  },
  {
    title: "8. Como protegemos",
    body: (
      <ul>
        <li>Conexão criptografada (HTTPS) e senhas armazenadas com hash.</li>
        <li>Acesso por papéis e permissões, com sessões revogáveis.</li>
        <li>Trilha de auditoria de ações sensíveis.</li>
        <li>Dados persistidos em banco PostgreSQL com acesso restrito e cópias de segurança.</li>
      </ul>
    ),
  },
  {
    title: "9. Seus direitos",
    body: (
      <>
        <p>Nos termos do art. 18 da LGPD, você pode pedir, a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
          <li>portabilidade, nos termos da regulamentação;</li>
          <li>informação sobre com quem compartilhamos;</li>
          <li>revogação do consentimento e informação sobre as consequências de não consenti-lo.</li>
        </ul>
        <p>
          Alguns dados, como o prontuário, não podem ser eliminados durante o prazo legal de guarda. Também é possível
          reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </>
    ),
  },
  {
    title: "10. Cookies e métricas",
    body: (
      <p>
        O sistema usa armazenamento local do navegador apenas para manter a sessão e lembrar preferências de
        interface. Podemos coletar métricas de uso agregadas e sem identificação do paciente para medir desempenho.
        Não usamos cookies de publicidade.
      </p>
    ),
  },
  {
    title: "11. Como falar com a gente",
    body: (
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre esta política, <ContactLine />. Respondemos nos prazos da LGPD.
      </p>
    ),
  },
  {
    title: "12. Mudanças nesta política",
    body: (
      <p>
        Podemos atualizar este texto para refletir mudanças legais ou no sistema. A data da última revisão fica no topo
        da página.
      </p>
    ),
  },
]

export default function PrivacyPolicyPage() {
  return <LegalPage title="Política de Privacidade" updatedAt="1º de novembro de 2026" sections={SECTIONS} />
}
