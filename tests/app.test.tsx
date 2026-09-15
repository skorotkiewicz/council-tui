import { expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "../index"

test("renders the welcome screen", async () => {
  const setup = await act(() => testRender(<App />, { width: 100, height: 24 }))
  try {
    await act(async () => {
      await setup.renderOnce()
    })
    const frame = setup.captureCharFrame()
    expect(frame).toContain("LLM Council")
    expect(frame).toContain("chairman")
    expect(frame).toContain("Ask the council")
  } finally {
    // renderer.destroy() unmounts the React tree; act keeps the unmount silent.
    await act(() => setup.renderer.destroy())
  }
})
