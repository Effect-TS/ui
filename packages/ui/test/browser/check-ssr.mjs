import { run } from "./run.mts"

await run("ssr", "", async (page, expect) => {
  const { popover, modal, dialog } = await page.evaluate(() =>
    globalThis.results
  )
  expect(popover.open, "a popover open from the start hydrates open", popover)
  expect(modal.open, "a dialog modal from the start hydrates modal", modal)
  expect(
    dialog.open && !dialog.window,
    "a dialog open but not modal hydrates without an iframe",
    dialog
  )
})
