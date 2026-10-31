"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import type { Patient } from "@/domain/types"
import { api } from "@/shared/api/demo-api"

/** Catálogos pequenos usados por vários módulos para resolver ids → nomes. */
export function useLookups() {
  const professionals = useQuery({ queryKey: ["professionals"], queryFn: () => api.professionals.list() })
  const services = useQuery({ queryKey: ["services"], queryFn: () => api.services.list() })
  const specialties = useQuery({ queryKey: ["specialties"], queryFn: () => api.specialties.list() })
  const rooms = useQuery({ queryKey: ["rooms"], queryFn: () => api.rooms.list() })
  // Perfis sem acesso a pacientes (ex.: gestor) recebem lista vazia em vez de erro.
  const patients = useQuery({
    queryKey: ["patients", "lookup"],
    queryFn: () => api.patients.list({ status: "all" }).catch((): Patient[] => []),
  })

  return useMemo(() => {
    const byId = <T extends { id: string }>(list?: T[]) => new Map((list ?? []).map((x) => [x.id, x]))
    return {
      patients: patients.data ?? [],
      patient: byId(patients.data),
      professionals: professionals.data ?? [],
      services: services.data ?? [],
      specialties: specialties.data ?? [],
      rooms: rooms.data ?? [],
      professional: byId(professionals.data),
      service: byId(services.data),
      specialty: byId(specialties.data),
      room: byId(rooms.data),
      isLoading: professionals.isLoading || services.isLoading || specialties.isLoading || rooms.isLoading,
    }
  }, [patients.data, professionals.data, services.data, specialties.data, rooms.data, professionals.isLoading, services.isLoading, specialties.isLoading, rooms.isLoading])
}
