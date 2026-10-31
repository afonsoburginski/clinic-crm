import { createSeed, DB_VERSION, withModuleDefaults, type DemoDB } from "./demo-seed"

const STORAGE_KEY = "clinica-demo-db"

let cache: DemoDB | null = null

function load(): DemoDB {
  if (typeof window === "undefined") return createSeed()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDB
      if (parsed.version === DB_VERSION) return withModuleDefaults(parsed)
    }
  } catch {
    // Corrupted demo data falls through to a fresh seed.
  }
  const seed = createSeed()
  persist(seed)
  return seed
}

function persist(db: DemoDB) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function getDB() {
  if (!cache) cache = load()
  return cache
}

export function commit() {
  if (cache) persist(cache)
}

export function resetDB() {
  cache = createSeed()
  persist(cache)
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function simulateLatency(min = 180, max = 420) {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))
}
