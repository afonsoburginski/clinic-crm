import {
  CalendarDays,
  ClipboardCheck,
  Settings,
  Stethoscope,
  UserRoundSearch,
  Wallet,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react"

import { canAny, type Permission } from "@/domain/permissions"
import type { User } from "@/domain/types"

/**
 * Roteiro da orientação inicial. Descreve o fluxo de trabalho da clínica por área, sem exemplos
 * de pacientes ou números: cada item só aparece para quem tem permissão de abrir a tela.
 */
export interface TourFeature {
  id: string
  title: string
  summary: string
  /** Passos curtos do fluxo, na ordem em que acontecem. */
  steps: string[]
  href: string
  icon: LucideIcon
  /** Qualquer uma das permissões libera o item (mesma regra do menu lateral). */
  anyOf: Permission[]
}

export const TOUR_FEATURES: TourFeature[] = [
  {
    id: "overview",
    title: "Visão geral",
    summary: "O resumo do dia: o que está agendado, o que pede atenção e como está a ocupação da semana.",
    steps: ["Comece o dia por aqui.", "Os indicadores seguem o seu perfil de acesso.", "Cada bloco leva à tela de origem."],
    href: "/painel",
    icon: LayoutDashboard,
    anyOf: ["dashboard:read"],
  },
  {
    id: "agenda",
    title: "Agenda",
    summary: "Atendimentos e bloqueios de toda a equipe, por dia, semana ou mês, com filtro por profissional e sala.",
    steps: [
      "Clique num horário livre ou em “Novo agendamento”.",
      "Conflitos de profissional, sala e expediente são verificados ao salvar.",
      "Se houver conflito, o painel sugere o próximo horário livre.",
      "Abra um atendimento para avançar o status, reagendar ou cancelar.",
    ],
    href: "/agenda",
    icon: CalendarDays,
    anyOf: ["appointments:read", "appointments:read-own"],
  },
  {
    id: "patients",
    title: "Pacientes e responsáveis",
    summary: "Cadastro central de pacientes, com os responsáveis vinculados e o que cada um pode fazer.",
    steps: [
      "Busque por nome, código ou CPF; o atalho Ctrl/⌘ K funciona em qualquer tela.",
      "O cadastro avisa quando encontra possível duplicidade.",
      "Vincule responsáveis e defina quem pode agendar e receber documentos.",
    ],
    href: "/pacientes",
    icon: UserRoundSearch,
    anyOf: ["patients:read", "patients:read-own"],
  },
  {
    id: "clinical",
    title: "Atendimento clínico",
    summary: "Prontuários, avaliações por etapas e planos ABA, restritos ao perfil clínico.",
    steps: [
      "Registre a evolução no prontuário do paciente.",
      "Registro finalizado não é editado: a retificação cria uma nova versão e preserva a anterior.",
      "Avaliações e planos ABA acompanham etapas, metas e sessões.",
    ],
    href: "/prontuarios",
    icon: ClipboardCheck,
    anyOf: ["clinical:read"],
  },
  {
    id: "clinic",
    title: "Equipe, serviços e salas",
    summary: "Quem atende, o que é oferecido e onde acontece.",
    steps: [
      "Defina a grade semanal de cada profissional e registre indisponibilidades.",
      "Serviços fixam duração e se exigem sala.",
      "Salas exclusivas não aceitam atendimentos simultâneos.",
    ],
    href: "/profissionais",
    icon: Stethoscope,
    anyOf: ["professionals:manage", "appointments:read", "services:manage", "rooms:manage"],
  },
  {
    id: "management",
    title: "Financeiro e documentos",
    summary: "Lançamentos com pagamentos e estornos, e documentos emitidos e liberados ao responsável.",
    steps: [
      "Cada lançamento mostra valor, pago e saldo em aberto.",
      "Estorno e cancelamento exigem motivo e ficam no histórico.",
      "Documento só chega ao responsável com liberação explícita.",
    ],
    href: "/financeiro",
    icon: Wallet,
    anyOf: ["finance:read", "documents:read"],
  },
  {
    id: "admin",
    title: "Configurações e auditoria",
    summary: "Regras da agenda e registro de quem alterou o quê.",
    steps: [
      "Ajuste expediente, antecedência mínima e exigência de motivo no cancelamento.",
      "A auditoria registra o fato da alteração, nunca o conteúdo clínico.",
    ],
    href: "/configuracoes",
    icon: Settings,
    anyOf: ["settings:manage", "audit:read"],
  },
]

/** Itens do roteiro que o usuário consegue abrir. */
export function featuresFor(user: User | null | undefined): TourFeature[] {
  return TOUR_FEATURES.filter((feature) => canAny(user, feature.anyOf))
}

export interface TourTip {
  id: string
  text: string
}

/** Dicas rápidas, na ordem de uso; as que dependem de permissão só aparecem para quem pode usá-las. */
export function tipsFor(user: User | null | undefined): TourTip[] {
  const tips: TourTip[] = []
  if (canAny(user, ["patients:read", "patients:read-own"])) {
    tips.push({ id: "quick-search", text: "Ctrl/⌘ K abre a busca de pacientes em qualquer tela." })
  }
  tips.push(
    { id: "toolbar", text: "Busca e filtros ficam na barra acima de cada lista e valem na hora, sem recarregar a página." },
    {
      id: "optimistic",
      text: "Ações diretas, como mudar o status de um atendimento ou remover um vínculo, aparecem na hora; se o sistema recusar, a tela volta ao que era e explica o motivo.",
    },
    { id: "account", text: "No menu da conta você alterna o tema, troca de perfil e revê esta orientação quando quiser." },
    { id: "demo", text: "Esta é uma demonstração: os dados ficam só neste navegador. Não registre informações reais de pacientes." }
  )
  return tips
}
