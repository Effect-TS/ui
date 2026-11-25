// Checks replay and live updates through the packaged CLI and Chromium.
// Build the page first: `pnpm --filter @effect/ui-devtools build-viewer`.
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM
const bin = fileURLToPath(
  new URL("../../node_modules/.bin/effect-ui-devtools", import.meta.url)
)
const app = fileURLToPath(new URL("viewer-app.ts", import.meta.url))

const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const line = (child, pattern) =>
  new Promise((resolve, reject) => {
    let out = ""
    const timer = setTimeout(() =>
      reject(
        new Error("no line matching " + pattern + " in " + JSON.stringify(out))
      ), 10_000)
    const read = (chunk) => {
      out += chunk
      const match = out.match(pattern)
      if (match === null) {
        return
      }
      clearTimeout(timer)
      child.stdout.off("data", read)
      resolve(match)
    }
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", read)
  })

const server = spawn(bin, ["--port", "47790"], {
  stdio: ["ignore", "pipe", "inherit"]
})
const terminal = spawn(process.execPath, [
  "--experimental-ffi",
  "--no-warnings",
  app,
  "http://127.0.0.1:47790"
], {
  stdio: ["pipe", "pipe", "inherit"]
})
const browser = await chromium.launch(
  executablePath === undefined ? undefined : { executablePath }
)
try {
  const [, url] = await line(server, /Effect UI DevTools: (\S+)/)
  terminal.stdin.write("ab\n")
  await line(terminal, /Hello ab/)

  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))
  const response = await page.goto(url)
  expect(
    response?.status() === 200,
    "the bin's URL serves the page",
    response?.status()
  )
  await page.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
  await page.waitForFunction(
    () => document.body.textContent.includes("\"ab\""),
    undefined,
    { timeout: 5_000 }
  )
  const shown = await page.evaluate(() => document.body.textContent)
  expect(
    shown.includes("Greeter"),
    "the page shows the terminal app's session",
    shown.slice(0, 200)
  )
  expect(
    await page.getByRole("button", { name: "Time travel" }).count() === 0 &&
      await page.getByRole("button", { name: "Close the inspector" })
          .count() === 0,
    "the page has no Time travel or close button",
    null
  )
  await page.evaluate(() => window.loaded = true)

  terminal.stdin.write("c\n")
  await line(terminal, /Hello abc/)
  await page.waitForFunction(
    () => document.body.textContent.includes("\"abc\""),
    undefined,
    { timeout: 5_000 }
  )
  expect(
    await page.evaluate(() => window.loaded === true),
    "the page updated without a reload",
    null
  )
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
  terminal.kill()
  server.kill()
}
for (const failure of failures) console.log(failure)
console.log(
  failures.length === 0
    ? "viewer: ok"
    : "viewer: " + failures.length + " failed"
)
if (failures.length > 0) process.exitCode = 1
