// Write-only persistence: every council turn is saved to data/<id>.json.
// Nothing is loaded at startup; the JSON files are the archive for reviewing
// past research. One file per turn, rewritten as stages complete.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Turn } from "./council"

const DATA_DIR = "data"

// Called once when a turn starts, so every update of the same turn
// rewrites the same file instead of spawning new ones.
export function newTurnId(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "")
  return `${new Date().toISOString().replace(/[:.]/g, "-")}${slug ? `-${slug}` : ""}`
}

export function saveTurn(turn: Turn): string {
  const path = join(DATA_DIR, `${turn.id}.json`)
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(path, JSON.stringify(turn, null, 2))
  } catch {
    // Persistence must never break a council run.
  }
  return path
}
