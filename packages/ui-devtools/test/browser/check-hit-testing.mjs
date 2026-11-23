import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const server = await createServer({
  root: import.meta.dirname,
  configFile: false,
  logLevel: "silent",
  resolve: { alias: { "@effect/ui-devtools": fileURLToPath(new URL("../../src/index.ts", import.meta.url)) } },
  server: { port: 0, strictPort: false }
})
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({ executablePath })
const failures = []

const check = async (position, open) => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
  page.on("pageerror", (error) => failures.push(position + ": page error " + String(error)))
  await page.goto(url + "?position=" + position)
  await page.waitForSelector("body[data-ready]", { state: "attached" })
  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  const launcher = frame.getByRole("button", { name: "Open the Effect UI inspector" })
  await launcher.waitFor()
  if (open) await launcher.click()
  const shape = open ? frame.getByRole("dialog", { name: "Effect UI inspector" }) : launcher
  await shape.waitFor()
  await page.waitForTimeout(100)
  const box = await shape.boundingBox()
  const name = position + (open ? " panel" : " launcher")
  const clicks = () => page.evaluate(() => globalThis.counts.clicks)
  const r = Math.min(8, box.height / 2)
  const outside = [
    [box.x - 2, box.y + box.height / 2],
    [box.x + box.width + 2, box.y + box.height / 2],
    [box.x + box.width / 2, box.y - 2],
    [box.x + box.width / 2, box.y + box.height + 2],
    [box.x + 1, box.y + 1],
    [box.x + box.width - 1, box.y + box.height - 1]
  ].filter(([x, y]) => x >= 0 && y >= 0 && x < 1100 && y < 760)
  for (const [x, y] of outside) {
    const before = await clicks()
    await page.mouse.click(x, y)
    if ((await clicks()) !== before + 1) failures.push(name + ": a click at " + x + "," + y + " missed the page")
  }
  const before = await clicks()
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(r * 2, box.height / 2))
  if ((await clicks()) !== before) failures.push(name + ": a click inside reached the page")
  if (open) {
    await frame.getByRole("button", { name: "Follow latest" }).focus()
    const keys = await page.evaluate(() => globalThis.counts.keys)
    await page.keyboard.press("Escape")
    if ((await page.evaluate(() => globalThis.counts.keys)) !== keys) failures.push(name + ": Escape reached the page")
  }
  await page.close()
}

try {
  for (const position of ["BottomRight", "TopLeft"]) {
    await check(position, false)
    await check(position, true)
  }
} finally {
  await browser.close()
  await server.close()
}
for (const failure of failures) console.log(failure)
console.log(failures.length === 0 ? "hit testing: ok" : "hit testing: " + failures.length + " failed")
process.exitCode = failures.length === 0 ? 0 : 1
