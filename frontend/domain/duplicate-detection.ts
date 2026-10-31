import type { Patient } from "./types"

export function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1))
      last = temp
    }
  }
  return prev[b.length]
}

export function nameSimilarity(a: string, b: string) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  const max = Math.max(na.length, nb.length)
  const editScore = 1 - levenshtein(na, nb) / max

  const ta = new Set(na.split(" "))
  const tb = new Set(nb.split(" "))
  const shared = [...ta].filter((t) => tb.has(t)).length
  const tokenScore = shared / Math.max(ta.size, tb.size)

  return Math.max(editScore, tokenScore)
}

export interface DuplicateMatch {
  patient: Patient
  score: number
  reasons: string[]
}

export function findPossibleDuplicates(
  input: { fullName: string; birthDate?: string; document?: string; id?: string },
  patients: Patient[]
): DuplicateMatch[] {
  const doc = input.document?.replace(/\D/g, "")
  const matches: DuplicateMatch[] = []

  for (const p of patients) {
    if (p.id === input.id) continue
    const reasons: string[] = []
    let score = 0

    if (doc && p.document && p.document.replace(/\D/g, "") === doc) {
      reasons.push("Mesmo documento")
      score += 1
    }

    const sim = input.fullName.trim().length >= 3 ? nameSimilarity(input.fullName, p.fullName) : 0
    const sameBirth = !!input.birthDate && input.birthDate === p.birthDate

    if (sim >= 0.8) {
      reasons.push("Nome muito parecido")
      score += sim * 0.6
    }
    if (sameBirth && sim >= 0.5) {
      reasons.push("Mesma data de nascimento")
      score += 0.5
    }

    if (reasons.length && score >= 0.6) matches.push({ patient: p, score, reasons })
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5)
}
