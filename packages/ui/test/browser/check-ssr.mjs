import { run } from "./run.mts"

await run("ssr", "", async (page, expect) => {
  const results = await page.evaluate(() => globalThis.results)
  expect(
    results.popover === true && results.modal === true,
    "a popover and a modal dialog open from the start hydrate open",
    results
  )
})
