import { afterAll, expect, test } from "bun:test"
import { COUNCIL_MODELS, type CouncilUpdate, calculateAggregate, runCouncil, type Stage2Result } from "../council"

// Expectations are derived from config.json, so this test passes with any model lineup.

const models = COUNCIL_MODELS
const label = (i: number) => `Response ${String.fromCharCode(65 + i)}`
const expectedLabelToModel = Object.fromEntries(models.map((m, i) => [label(i), m]))

// One canned answer per council model (stage 1), one ranking per council model
// (stage 2), then the chairman (called last). Rankings may mention labels beyond
// the lineup; unknown ones are dropped consistently on both sides.
const ORDERS = [
  ["B", "A", "C", "D"],
  ["A", "B", "C", "D"],
  ["A", "C", "B", "D"],
  ["B", "A", "D", "C"],
]
const rankerOrders = models.map((_, i) => ORDERS[i % ORDERS.length])
const CANNED = [
  ...models.map((_, i) => ({ content: `Answer from model ${i + 1}` })),
  ...rankerOrders.map((order) => ({
    content: `FINAL RANKING:\n${order.map((l, i) => `${i + 1}. Response ${l}`).join("\n")}`,
  })),
  { content: "Chairman synthesis here." },
]

let call = 0
const originalFetch = globalThis.fetch
globalThis.fetch = (async () => {
  const body = CANNED[Math.min(call++, CANNED.length - 1)]
  return new Response(JSON.stringify({ choices: [{ message: body }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}) as unknown as typeof fetch

afterAll(() => {
  globalThis.fetch = originalFetch
})

// Needs a configured council (config.json with models); skipped on fresh clones.
test.skipIf(models.length === 0)("runCouncil emits stage1, stage2 + aggregate, then final", async () => {
  const events: CouncilUpdate[] = []
  await runCouncil("test question", (u) => events.push(u))

  expect(events).toHaveLength(4)
  expect(events[0].stage1).toBeUndefined()
  expect(events[1].stage1).toHaveLength(models.length)
  expect(events[1].stage1?.map((s) => s.response)).toEqual(models.map((_, i) => `Answer from model ${i + 1}`))
  expect(events[2].stage2).toHaveLength(models.length)
  expect(events[2].labelToModel).toEqual(expectedLabelToModel)
  // Expected aggregate computed with the same pure function the unit tests cover.
  const expectedAggregate = calculateAggregate(
    rankerOrders.map(
      (order): Stage2Result => ({ model: "x", ranking: "", parsedRanking: order.map((l) => `Response ${l}`) }),
    ),
    expectedLabelToModel,
  )
  expect(events[2].aggregate).toEqual(expectedAggregate)
  expect(events[3].final?.response).toBe("Chairman synthesis here.")
})
