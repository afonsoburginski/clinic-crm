export const transitions: Record<string, string[]> = {
  requested: ["pending", "confirmed", "cancelled"], pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "no_show", "cancelled"], in_progress: ["completed"],
  completed: [], cancelled: [], no_show: [],
}

export function validateAppointment(input: { kind?: string; startsAt: string; endsAt: string; status?: string }) {
  const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("validation")
  if (input.kind === "block" && !(input.status ?? "pending")) throw new Error("validation")
  if (input.status && !["requested", "pending", "confirmed"].includes(input.status)) throw new Error("validation")
}
