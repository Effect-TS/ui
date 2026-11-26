import { run } from "./run.mts"

await run("ssr", "", async (page, expect) => {
  const { popover, modal } = await page.evaluate(() => globalThis.results)
  expect(
    popover === true,
    "a popover open from the start hydrates open",
    popover
  )
  expect(modal === true, "a dialog modal from the start hydrates modal", modal)
})
