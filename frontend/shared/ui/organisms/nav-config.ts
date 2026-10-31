import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileText,
  FolderOpen,
  HeartHandshake,
  LayoutDashboard,
  Settings,
  Stethoscope,
  Target,
  UserRoundSearch,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import type { Permission } from "@/domain/permissions"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Qualquer uma das permissões libera o item. */
  anyOf: Permission[]
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operação",
    items: [
      { href: "/painel", label: "Visão geral", icon: LayoutDashboard, anyOf: ["dashboard:read"] },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, anyOf: ["appointments:read", "appointments:read-own"] },
      { href: "/pacientes", label: "Pacientes", icon: UserRoundSearch, anyOf: ["patients:read", "patients:read-own"] },
      { href: "/responsaveis", label: "Responsáveis", icon: HeartHandshake, anyOf: ["patients:read"] },
    ],
  },
  {
    label: "Atendimento clínico",
    items: [
      { href: "/prontuarios", label: "Prontuários", icon: FileText, anyOf: ["clinical:read"] },
      { href: "/avaliacoes", label: "Avaliações", icon: ClipboardCheck, anyOf: ["clinical:read"] },
      { href: "/aba", label: "Plano ABA", icon: Target, anyOf: ["clinical:read"] },
    ],
  },
  {
    label: "Clínica",
    items: [
      { href: "/profissionais", label: "Profissionais", icon: Users, anyOf: ["professionals:manage", "appointments:read"] },
      { href: "/servicos", label: "Serviços", icon: Stethoscope, anyOf: ["services:manage"] },
      { href: "/salas", label: "Salas", icon: DoorOpen, anyOf: ["rooms:manage"] },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/financeiro", label: "Financeiro", icon: Wallet, anyOf: ["finance:read"] },
      { href: "/documentos", label: "Documentos", icon: FolderOpen, anyOf: ["documents:read"] },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/configuracoes", label: "Configurações", icon: Settings, anyOf: ["settings:manage", "users:read"] },
      { href: "/auditoria", label: "Auditoria", icon: ClipboardList, anyOf: ["audit:read"] },
    ],
  },
]
