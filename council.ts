// Core council logic, ported 1:1 from llm-council/backend (Python) to TypeScript.
// No server: the TUI talks to OpenRouter via @ai-sdk/openai-compatible.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText } from "ai"

export const COUNCIL_MODELS = [
  "openai/gpt-5.1",
  "google/gemini-3-pro-preview",
  "anthropic/claude-sonnet-4.5",
  "x-ai/grok-4",
]

export const CHAIRMAN_MODEL = "google/gemini-3-pro-preview"

export type ChatMessage = { role: "user" | "system" | "assistant"; content: string }

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
})

export type Stage1Result = { model: string; response: string }
export type Stage2Result = { model: string; ranking: string; parsedRanking: string[] }
export type AggregateRank = { model: string; averageRank: number; rankingsCount: number }
export type FinalResult = { model: string; response: string }

export type CouncilUpdate = {
  stage1?: Stage1Result[]
  stage2?: Stage2Result[]
  labelToModel?: Record<string, string>
  aggregate?: AggregateRank[]
  final?: FinalResult
  status?: string
  error?: string
}

async function queryModel(model: string, messages: ChatMessage[], timeoutMs = 120_000): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: openrouter(model),
      messages,
      abortSignal: AbortSignal.timeout(timeoutMs),
    })
    return text
  } catch {
    // Graceful degradation, same as the Python backend: a failed model drops out.
    return null
  }
}

function queryModelsParallel(models: string[], messages: ChatMessage[]) {
  return Promise.all(models.map((m) => queryModel(m, messages)))
}

export async function stage1CollectResponses(userQuery: string): Promise<Stage1Result[]> {
  const responses = await queryModelsParallel(COUNCIL_MODELS, [{ role: "user", content: userQuery }])
  return COUNCIL_MODELS.flatMap((model, i) => (responses[i] === null ? [] : [{ model, response: responses[i] as string }]))
}

export async function stage2CollectResponses(
  userQuery: string,
  stage1: Stage1Result[],
): Promise<[Stage2Result[], Record<string, string>]> {
  const labels = stage1.map((_, i) => String.fromCharCode(65 + i)) // A, B, C, ...

  // Models see anonymous labels; this mapping de-anonymizes for display only.
  const labelToModel = Object.fromEntries(stage1.map((r, i) => [`Response ${labels[i]}`, r.model]))

  const responsesText = stage1.map((r, i) => `Response ${labels[i]}:\n${r.response}`).join("\n\n")

  const rankingPrompt = `You are evaluating different responses to the following question:

Question: ${userQuery}

Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`

  const responses = await queryModelsParallel(COUNCIL_MODELS, [{ role: "user", content: rankingPrompt }])

  const stage2 = COUNCIL_MODELS.flatMap((model, i) =>
    responses[i] === null ? [] : [{ model, ranking: responses[i] as string, parsedRanking: parseRankingFromText(responses[i] as string) }],
  )

  return [stage2, labelToModel]
}

export async function stage3Synthesize(
  userQuery: string,
  stage1: Stage1Result[],
  stage2: Stage2Result[],
): Promise<FinalResult> {
  const stage1Text = stage1.map((r) => `Model: ${r.model}\nResponse: ${r.response}`).join("\n\n")
  const stage2Text = stage2.map((r) => `Model: ${r.model}\nRanking: ${r.ranking}`).join("\n\n")

  const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: ${userQuery}

STAGE 1 - Individual Responses:
${stage1Text}

STAGE 2 - Peer Rankings:
${stage2Text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`

  const response = await queryModel(CHAIRMAN_MODEL, [{ role: "user", content: chairmanPrompt }])
  return {
    model: CHAIRMAN_MODEL,
    response: response ?? "Error: Unable to generate final synthesis.",
  }
}

export function parseRankingFromText(text: string): string[] {
  const marker = "FINAL RANKING:"
  const idx = text.indexOf(marker)
  // Everything after the marker if present, otherwise the whole text.
  const section = idx >= 0 ? text.slice(idx + marker.length) : text

  const numbered = section.match(/\d+\.\s*Response [A-Z]/g)
  if (numbered) return numbered.map((m) => m.match(/Response [A-Z]/)![0])

  // Fallback: any "Response X" patterns in order.
  return section.match(/Response [A-Z]/g) ?? []
}

export function calculateAggregate(stage2: Stage2Result[], labelToModel: Record<string, string>): AggregateRank[] {
  const positions = new Map<string, number[]>()

  for (const r of stage2) {
    r.parsedRanking.forEach((label, i) => {
      const model = labelToModel[label]
      if (!model) return
      const list = positions.get(model) ?? []
      list.push(i + 1)
      positions.set(model, list)
    })
  }

  return [...positions.entries()]
    .map(([model, pos]) => ({
      model,
      averageRank: Math.round((pos.reduce((a, b) => a + b, 0) / pos.length) * 100) / 100,
      rankingsCount: pos.length,
    }))
    .sort((a, b) => a.averageRank - b.averageRank)
}

export async function runCouncil(query: string, onProgress: (update: CouncilUpdate) => void): Promise<void> {
  onProgress({ status: `Stage 1: querying ${COUNCIL_MODELS.length} models in parallel...` })

  const stage1 = await stage1CollectResponses(query)
  if (!stage1.length) {
    onProgress({ error: "All models failed to respond. Check OPENROUTER_API_KEY and model IDs." })
    return
  }
  onProgress({
    stage1,
    status: `Stage 1 done (${stage1.length}/${COUNCIL_MODELS.length} responded). Stage 2: anonymized peer review...`,
  })

  const [stage2, labelToModel] = await stage2CollectResponses(query, stage1)
  onProgress({
    stage2,
    labelToModel,
    aggregate: calculateAggregate(stage2, labelToModel),
    status: `Stage 2 done. Stage 3: chairman synthesis (${CHAIRMAN_MODEL})...`,
  })

  const final = await stage3Synthesize(query, stage1, stage2)
  onProgress({ final, status: "Done. Enter to ask again." })
}
