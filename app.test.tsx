import { expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { App } from "./index"

test("renders the welcome screen", async () => {
  const setup = await testRender(<App />, { width: 100, height: 24 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    expect(frame).toContain("LLM Council")
    expect(frame).toContain("chairman")
    expect(frame).toContain("Ask the council")
  } finally {
    setup.renderer.destroy()
  }
})
