# LLM Council TUI

Terminal rebuild of [llm-council](../llm-council): 3-stage deliberation where multiple
LLMs answer, rank each other anonymously, and a chairman synthesizes the final answer.
No Python backend — the TUI calls OpenRouter directly.

## Run

```bash
bun install
echo 'OPENROUTER_API_KEY=sk-...' > .env   # bun auto-loads .env
bun start
```

## Keys

| Key          | Action                  |
| ------------ | ----------------------- |
| `Ctrl+Enter` | Send question           |
| `Enter`      | Newline in input        |
| `Ctrl+←/→`   | Switch stage tab        |
| `Ctrl+↑/↓`   | Switch turn             |
| `Alt+↑/↓`    | Scroll content          |
| `Ctrl+C`     | Quit                    |

## Tests

```bash
bun test
```
