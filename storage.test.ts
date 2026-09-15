import { existsSync, readFileSync, rmSync } from "node:fs"
import { expect, test } from "bun:test"
import type { Turn } from "./council"
import { newTurnId, saveTurn } from "./storage"

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
