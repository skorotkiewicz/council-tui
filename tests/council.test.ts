import { expect, test } from "bun:test"
import { calculateAggregate, parseRankingFromText, type Stage2Result } from "../council"

test("parseRankingFromText extracts the FINAL RANKING section", () => {
  const text = `Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B`
  expect(parseRankingFromText(text)).toEqual(["Response C", "Response A", "Response B"])
})

test("parseRankingFromText falls back to Response X order when the marker is missing", () => {
  const text = "I think Response B wins, then Response A."
  expect(parseRankingFromText(text)).toEqual(["Response B", "Response A"])
})

test("parseRankingFromText returns empty for no ranking at all", () => {
  expect(parseRankingFromText("no ranking here")).toEqual([])
})

test("calculateAggregate averages ranks per model and sorts best first", () => {
  const labelToModel = {
    "Response A": "m1",
    "Response B": "m2",
    "Response C": "m3",
  }
  const stage2: Stage2Result[] = [
    {
      model: "m1",
      ranking: "",
      parsedRanking: ["Response C", "Response A", "Response B"],
    },
    {
      model: "m2",
      ranking: "",
      parsedRanking: ["Response C", "Response B", "Response A"],
    },
    {
      model: "m3",
      ranking: "",
      parsedRanking: ["Response A", "Response C", "Response B"],
    },
  ]
  // A: (2+3+1)/3 = 2.0, B: (3+2+3)/3 = 2.67, C: (1+1+2)/3 = 1.33
  expect(calculateAggregate(stage2, labelToModel)).toEqual([
    { model: "m3", averageRank: 1.33, rankingsCount: 3 },
    { model: "m1", averageRank: 2, rankingsCount: 3 },
    { model: "m2", averageRank: 2.67, rankingsCount: 3 },
  ])
})
