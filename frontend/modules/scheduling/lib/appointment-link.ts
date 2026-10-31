/** Consome apenas os parâmetros usados pelos atalhos de criação da agenda. */
export function consumeAppointmentLink(url: URL) {
  if (url.searchParams.get('novo') !== '1') return null

  const patientId = url.searchParams.get('paciente') || undefined
  const next = new URL(url)
  next.searchParams.delete('novo')
  next.searchParams.delete('paciente')

  return { patientId, nextUrl: `${next.pathname}${next.search}${next.hash}` }
}
