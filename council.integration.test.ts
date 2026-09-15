import { afterAll, expect, test } from "bun:test"
import { runCouncil, type CouncilUpdate } from "./council"

// Stub OpenRouter with canned responses, one per model call.
// Council models get stage1 answers, then stage2 rankings; the chairman (called
// last) gets a unique prompt so it is identifiable.
const CANNED = [
  { content: "Answer from model 1" },
  { content: "Answer from model 2" },
  { content: "Answer from model 3" },
  { content: "Answer from model 4" },
  {
    content: "Response C is fine.\nResponse D is weak.\n\nFINAL RANKING:\n1. Response B\n2. Response A\n3. Response C\n4. Response D",
  },
  {
    content: "FINAL RANKING:\n1. Response A\n2. Response B\n3. Response C\n4. Response D",
  },
  {
    content: "FINAL RANKING:\n1. Response A\n2. Response C\n3. Response B\n4. Response D",
  },
  {
    content: "FINAL RANKING:\n1. Response B\n2. Response A\n3. Response D\n4. Response C",
  },
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

test("runCouncil emits stage1, stage2 + aggregate, then final", async () => {
  const events: CouncilUpdate[] = []
  await runCouncil("test question", (u) => events.push(u))

  expect(events).toHaveLength(4)
  expect(events[0].stage1).toBeUndefined()
  expect(events[1].stage1).toHaveLength(4)
  expect(events[2].stage2).toHaveLength(4)
  expect(events[2].labelToModel).toEqual({
    "Response A": "openai/gpt-5.1",
    "Response B": "google/gemini-3-pro-preview",
    "Response C": "anthropic/claude-sonnet-4.5",
    "Response D": "x-ai/grok-4",
  })
  // A: (2+1+1+2)/4=1.5, B: (1+2+3+1)/4=1.75, C: (3+3+2+4)/4=3, D: (4+4+4+3)/4=3.75
  expect(events[2].aggregate).toEqual([
    { model: "openai/gpt-5.1", averageRank: 1.5, rankingsCount: 4 },
    { model: "google/gemini-3-pro-preview", averageRank: 1.75, rankingsCount: 4 },
    { model: "anthropic/claude-sonnet-4.5", averageRank: 3, rankingsCount: 4 },
    { model: "x-ai/grok-4", averageRank: 3.75, rankingsCount: 4 },
  ])
  expect(events[3].final?.response).toBe("Chairman synthesis here.")
})
