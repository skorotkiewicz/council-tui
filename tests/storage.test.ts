import { expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import type { Turn } from "../council"
import { loadTurns, newTurnId, saveTurn } from "../storage"

test("newTurnId is filesystem-safe and saveTurn writes readable JSON", () => {
  const id = newTurnId("What is 2+2? / test & stuff")
  expect(id).not.toContain("/")

  const turn: Turn = {
    id,
    question: "What is 2+2?",
    stage1: [{ model: "m1", response: "4" }],
    stage2: [],
    labelToModel: {},
    aggregate: [],
    final: null,
  }
  const path = saveTurn(turn)
  expect(existsSync(path)).toBe(true)
  expect(JSON.parse(readFileSync(path, "utf8")).stage1).toEqual([{ model: "m1", response: "4" }])
  rmSync(path)
})

test("loadTurns reads the archive and skips corrupt files", () => {
  mkdirSync("data", { recursive: true })
  writeFileSync("data/bad.json", "{nope")
  const good: Turn = {
    id: "0-test-good",
    question: "q",
    stage1: [],
    stage2: [],
    labelToModel: {},
    aggregate: [],
    final: null,
  }
  writeFileSync("data/0-test-good.json", JSON.stringify(good))
  const turns = loadTurns()
  expect(turns.some((t) => t.id === "0-test-good")).toBe(true)
  rmSync("data/0-test-good.json")
  rmSync("data/bad.json")
})
