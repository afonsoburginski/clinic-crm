import { redirect } from "next/navigation"

/** O cadastro abre em dialog sobre a lista: esta rota antiga só redireciona (links e favoritos continuam valendo). */
export default function NewPatientPage() {
  redirect("/pacientes?novo=1")
}
