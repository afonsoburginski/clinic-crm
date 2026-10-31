import { redirect } from "next/navigation"

/** A edição abre em dialog sobre a ficha: esta rota antiga só redireciona (links e favoritos continuam valendo). */
export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/pacientes/${encodeURIComponent(id)}?editar=1`)
}
