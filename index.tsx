import { createCliRenderer, RGBA, ScrollBoxRenderable, SyntaxStyle, TextareaRenderable, type Renderable } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  CHAIRMAN_MODEL,
  COUNCIL_MODELS,
  runCouncil,
  type CouncilUpdate,
  type Turn,
} from "./council"
import { loadTurns, newTurnId, saveTurn } from "./storage"

const C = {
  fg: "#c0caf5",
  dim: "#565f89",
  accent: "#7dcfff",
  green: "#9ece6a",
  yellow: "#e0af68",
  red: "#f7768e",
  border: "#3b4261",
  selBg: "#2f3549",
}

const syntaxStyle = SyntaxStyle.fromStyles({
  "markup.heading.1": { fg: RGBA.fromHex(C.accent), bold: true },
  "markup.heading.2": { fg: RGBA.fromHex(C.accent), bold: true },
  "markup.heading.3": { fg: RGBA.fromHex(C.fg), bold: true },
  "markup.bold": { fg: RGBA.fromHex(C.yellow), bold: true },
  "markup.italic": { fg: RGBA.fromHex(C.yellow) },
  "markup.list": { fg: RGBA.fromHex(C.fg) },
  "markup.raw": { fg: RGBA.fromHex(C.green) },
  default: { fg: RGBA.fromHex(C.fg) },
})

const STAGE_NAMES = ["Stage 1", "Stage 2", "Final"] as const

function shortName(model: string) {
  return model.split("/")[1] ?? model
}

function labelFor(turn: Turn, model: string): string | null {
  for (const [label, m] of Object.entries(turn.labelToModel)) {
    if (m === model) return label
  }
  return null
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <box flexDirection="column" marginTop={1} width="100%">
      <text>
        <span style={{ fg: C.accent }}>{`── ${title}`}</span>
        {subtitle ? <span style={{ fg: C.dim }}>{`  ${subtitle}`}</span> : null}
      </text>
      {children}
    </box>
  )
}

function TabBar({ stage, turnIdx, total }: { stage: number; turnIdx: number; total: number }) {
  return (
    <box flexDirection="row" marginTop={1} width="100%">
      {STAGE_NAMES.map((name, i) => (
        <box key={name} backgroundColor={i === stage ? C.selBg : undefined} paddingLeft={1} paddingRight={1}>
          <text fg={i === stage ? C.accent : C.dim}>{name}</text>
        </box>
      ))}
      <box flexGrow={1} />
      <text fg={C.dim}>{`turn ${turnIdx + 1}/${total}`}</text>
    </box>
  )
}

function TurnView({ turn, stage }: { turn: Turn; stage: number }) {
  return (
    <box flexDirection="column" width="100%">
      <text>
        <b style={{ fg: C.green }}>Q: </b>
        <span style={{ fg: C.fg }}>{turn.question}</span>
      </text>

      {stage === 0 && turn.stage1.map((s) => (
        <Section key={s.model} title={shortName(s.model)}>
          <markdown content={s.response} syntaxStyle={syntaxStyle} />
        </Section>
      ))}

      {stage === 1 && (
        <box flexDirection="column" width="100%">
          <text fg={C.dim}>
            {"Models saw anonymous labels (Response A, B, ...). Real names below are for readability only."}
          </text>
          {turn.stage2.map((s) => {
            const label = labelFor(turn, s.model)
            return (
              <Section key={s.model} title={shortName(s.model)} subtitle={label ? `(was "${label}")` : undefined}>
                <markdown content={s.ranking} syntaxStyle={syntaxStyle} />
                <text fg={s.parsedRanking.length ? C.dim : C.red}>
                  {s.parsedRanking.length
                    ? `Parsed: ${s.parsedRanking.map((l) => labelToName(turn, l)).join(" > ")}`
                    : "(no ranking parsed)"}
                </text>
              </Section>
            )
          })}
          <Section title="Aggregate rankings" subtitle="(lower average = better)">
            {turn.aggregate.map((a, i) => (
              <text key={a.model}>
                <span style={{ fg: C.yellow }}>{`${i + 1}. `}</span>
                <span style={{ fg: C.fg }}>{shortName(a.model)}</span>
                <span style={{ fg: C.dim }}>{`  avg ${a.averageRank.toFixed(2)}  (${a.rankingsCount} vote${a.rankingsCount === 1 ? "" : "s"})`}</span>
              </text>
            ))}
          </Section>
        </box>
      )}

      {stage === 2 && (turn.final ? (
        <Section title={`${shortName(turn.final.model)} (chairman)`}>
          <markdown content={turn.final.response} syntaxStyle={syntaxStyle} />
        </Section>
      ) : (
        <text fg={C.dim}>Waiting for chairman...</text>
      ))}
    </box>
  )
}

function labelToName(turn: Turn, label: string): string {
  const model = turn.labelToModel[label]
  return model ? shortName(model) : label.replace("Response ", "")
}

function Welcome() {
  return (
    <box flexDirection="column" paddingLeft={1} paddingTop={1} width="100%">
      <text fg={C.fg}>LLM Council TUI</text>
      <text fg={C.dim}>{`${COUNCIL_MODELS.map(shortName).join(" · ")}  |  chairman: ${shortName(CHAIRMAN_MODEL)}`}</text>
      <text fg={C.dim}>{"Ask a question below (Enter to send). Stage 1 collects individual answers,"}</text>
      <text fg={C.dim}>{"Stage 2 has every model rank anonymized peers, Stage 3 the chairman synthesizes."}</text>
    </box>
  )
}

export function App() {
  const [turns, setTurns] = useState<Turn[]>([])
  const turnsRef = useRef<Turn[]>([])
  const [turnIdx, setTurnIdx] = useState(-1)
  const turnIdxRef = useRef(-1)
  const [stage, setStage] = useState(0)
  const [status, setStatus] = useState(
    process.env.OPENROUTER_API_KEY ? "Ready. Enter to ask." : "Set OPENROUTER_API_KEY (.env is auto-loaded by bun).",
  )
  const runningRef = useRef(false)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    const saved = loadTurns()
    if (saved.length) {
      turnsRef.current = saved
      setTurns(saved)
      setStatus(`${saved.length} archived run(s) in data/. Ctrl+↓ for the latest, Ctrl+↑ to browse. Enter to ask.`)
    }
  }, [])

  const jumpTo = useCallback((idx: number) => {
    turnIdxRef.current = idx
    setTurnIdx(idx)
  }, [])

  const apply = useCallback(
    (idx: number, patch: CouncilUpdate) => {
      turnsRef.current[idx] = { ...turnsRef.current[idx], ...patch } as Turn
      setTurns([...turnsRef.current])
      const savedPath = saveTurn(turnsRef.current[idx])
      if (patch.stage1) {
        jumpTo(idx)
        setStage(0)
      }
      if (patch.final) {
        jumpTo(idx)
        setStage(2)
        setStatus(`Done. Saved to ${savedPath}`)
        return
      }
      if (patch.error) {
        setStatus(`${patch.error} (Saved to ${savedPath})`)
        return
      }
      if (patch.status) setStatus(patch.status)
    },
    [jumpTo],
  )

  const send = useCallback(() => {
    const text = textareaRef.current?.plainText.trim()
    if (!text || runningRef.current) return
    runningRef.current = true
    textareaRef.current?.setText("")
    const idx = turnsRef.current.length
    turnsRef.current.push({
      id: newTurnId(text),
      question: text,
      stage1: [],
      stage2: [],
      labelToModel: {},
      aggregate: [],
      final: null,
    })
    setTurns([...turnsRef.current])
    jumpTo(idx)
    setStage(0)
    runCouncil(text, (u) => apply(idx, u)).finally(() => {
      runningRef.current = false
    })
  }, [apply, jumpTo])

  useKeyboard((key) => {
    if (key.eventType !== "press") return
    if (key.meta && key.name === "up") return void scrollRef.current?.scrollBy(-5)
    if (key.meta && key.name === "down") return void scrollRef.current?.scrollBy(5)
    if (key.ctrl && key.name === "left") setStage((s) => Math.max(0, s - 1))
    else if (key.ctrl && key.name === "right") setStage((s) => Math.min(STAGE_NAMES.length - 1, s + 1))
    else if (key.ctrl && key.name === "up") jumpTo(Math.max(0, turnIdxRef.current - 1))
    else if (key.ctrl && key.name === "down") jumpTo(Math.min(turnsRef.current.length - 1, turnIdxRef.current + 1))
  })

  const turn = turns[turnIdx]

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} paddingLeft={1}>
        <text>
          <b style={{ fg: C.green }}>LLM Council</b>
          <span style={{ fg: C.dim }}>{`  ${COUNCIL_MODELS.map(shortName).join(" · ")}  |  chairman: ${shortName(CHAIRMAN_MODEL)}`}</span>
        </text>
      </box>

      <scrollbox
        ref={(r: Renderable | null) => {
          scrollRef.current = r as ScrollBoxRenderable | null
        }}
        flexGrow={1}
        width="100%"
      >
        {turn ? (
          <box flexDirection="column" width="100%">
            <TabBar stage={stage} turnIdx={turnIdx} total={turns.length} />
            {turn.error ? <text fg={C.red}>{turn.error}</text> : <TurnView turn={turn} stage={stage} />}
          </box>
        ) : (
          <Welcome />
        )}
      </scrollbox>

      <box border borderColor={C.border} height={5} width="100%">
        <textarea
          ref={(r: Renderable | null) => {
            textareaRef.current = r as TextareaRenderable | null
          }}
          width="100%"
          height="100%"
          placeholder="Ask the council... (Enter to send, Shift+Enter for newline)"
          placeholderColor={C.dim}
          focusedBackgroundColor="#1a1b26"
          textColor={C.fg}
          focusedTextColor={C.fg}
          cursorColor={C.accent}
          wrapMode="word"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
            { name: "return", ctrl: true, action: "submit" },
            { name: "kpenter", action: "submit" },
            { name: "kpenter", shift: true, action: "newline" },
            { name: "linefeed", action: "newline" },
          ]}
          onSubmit={send}
        />
      </box>

      <box height={1} paddingLeft={1}>
        <text fg={C.dim}>
          Enter send · Shift+Enter newline · Ctrl+←→ stage · Ctrl+↑↓ turn · Alt+↑↓ scroll · Ctrl+C quit
        </text>
      </box>
      <box height={1} paddingLeft={1}>
        <text fg={C.yellow}>{status}</text>
      </box>
    </box>
  )
}

if (import.meta.main) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  createRoot(renderer).render(<App />)
}
