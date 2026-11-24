import { Effect } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { FetchHttpClient } from "effect/http"
import { chromium } from "playwright"
import { createServer } from "vite"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const server = await createServer({
  root: import.meta.dirname,
  logLevel: "silent",
  server: { port: 0 }
})
await server.listen()
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch({ executablePath })
const failures = []
let checks = 0
const expect = (ok, what, detail) => {
  checks++
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const checkMcp = (frame, scene) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const transport = yield* McpClient.http({
        url: "http://127.0.0.1:4774/mcp",
        protocol: McpProtocol.v2025_11_25
      }).pipe(Effect.provide(FetchHttpClient.layer))
      const client = yield* McpClient.make({
        name: "check-devtools",
        version: "0"
      }).pipe(Effect.provideService(McpClient.Transport, transport))
      const tools = new Map(
        (yield* client.listTools()).map((tool) => [tool.name, tool])
      )
      const call = (name, args) =>
        client.callTool({ tool: tools.get(name), arguments: args }).pipe(
          Effect.map((result) => {
            if (result.isError) {
              throw new Error(name + ": " + result.content?.[0]?.text)
            }
            return result.structuredContent.result
          })
        )

      const sessions = yield* call("list_sessions")
      const live = sessions.filter((session) => session.connected)
      expect(
        live.length === 1 && live[0].app === "Uploads" && live[0].controllable,
        "list_sessions has the page as one connected, controllable session",
        sessions
      )
      const [root] = yield* call("list_instances")

      const starts = yield* call("list_entries", { tag: "ClickedStartUpload" })
      const first = starts.rows[0].seq
      const shown = yield* call("show_entry", { seq: first })
      yield* Effect.promise(() =>
        frame.locator(".paused-label", { hasText: "Paused at #" + first })
          .waitFor({ timeout: 5_000 })
      )
      const painted = yield* Effect.promise(() => scene())
      expect(
        shown.paused === first && !painted.liveShown &&
          painted.copy?.length === 1,
        "show_entry paints the page at the entry and the panel shows it as paused",
        { shown, painted }
      )
      yield* Effect.promise(() =>
        frame.getByRole("button", { name: "Resume the live page" }).click({
          timeout: 5_000
        })
      )
      yield* Effect.sleep("200 millis")
      const afterHuman = (yield* call("list_sessions")).find((session) =>
        session.connected
      )
      expect(
        afterHuman.paused === undefined,
        "a person's Resume ends an agent's pause",
        afterHuman
      )

      const cancelled = yield* call("dispatch", {
        instance: root.instance,
        messages: [{ _tag: "ClickedCancelUpload", uploadId: 1 }]
      })
      const cancel = yield* call("get_entry", {
        seq: cancelled.outcomes[0]?.seq,
        path: ["message"]
      })
      yield* Effect.promise(() =>
        page.getByRole("button", { name: "Restart upload 1" }).waitFor({
          timeout: 5_000
        })
      )
      expect(
        cancelled.applied === 1 && cancel._tag === "ClickedCancelUpload",
        "dispatch cancels the upload and returns the seq of its Update",
        { cancelled, cancel }
      )

      const started = yield* call("dispatch", {
        instance: root.instance,
        messages: [{ _tag: "ClickedStartUpload" }]
      })
      const since = started.outcomes[0].seq - 1
      const waited = yield* call("wait", { since, timeout: 10_000 })
      const state = yield* call("get_state", { instance: root.instance })
      expect(
        waited.settled && state.model.uploads.at(-1)?.status === "Done",
        "wait returns once the dispatched upload's Command has ended",
        { waited, uploads: state.model.uploads }
      )
    }).pipe(Effect.scoped)
  )

const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
page.on("pageerror", (error) => failures.push("page error " + String(error)))

const scene = () =>
  page.evaluate(() => {
    const live = document.getElementById("root")
    const copy = live.nextElementSibling?.hasAttribute("inert")
      ? live.nextElementSibling
      : null
    const rows = (root) =>
      Array.from(root.querySelectorAll("li"), (row) =>
        row.textContent.replace(/\s+/g, " ").trim())
    return {
      liveShown: getComputedStyle(live).display !== "none",
      live: rows(live),
      copy: copy === null ? null : rows(copy),
      empty: copy?.textContent.includes("Nothing here yet") ?? null
    }
  })

try {
  await page.goto(url)
  const frame = page.frameLocator("iframe[data-effect-ui-devtools]")
  await page.getByRole("button", { name: "Upload a file" }).click({
    timeout: 10_000
  })
  await frame.getByRole("button", { name: "Open the Effect UI inspector" })
    .click()
  await frame.getByRole("dialog", { name: "Effect UI inspector" }).waitFor()
  const entries = async () =>
    Number((await frame.locator(".bar .count").textContent()).split(" ")[0])

  const before = await entries()
  await frame.locator(".row-button", { hasText: "ClickedStartUpload" }).first()
    .click()
  await frame.getByRole("button", { name: "Time travel" }).click({
    timeout: 5_000
  })
  await frame.getByRole("button", { name: "Resume the live page" }).waitFor()
  await frame.locator(".row-button", { hasText: "Mounted" }).first().click()
  await page.waitForTimeout(200)
  const empty = await scene()
  expect(
    empty.empty === true && !empty.liveShown,
    "a jump to Mounted paints the empty page",
    empty
  )
  await frame.locator(".row-button", { hasText: "ClickedStartUpload" }).first()
    .click()
  await page.waitForTimeout(200)
  const paused = await scene()
  expect(
    paused.copy?.length === 1 && paused.copy[0].includes("Uploading"),
    "the copy shows the upload as it was when it started",
    paused
  )
  expect((await entries()) === before, "painting and repainting log nothing", {
    before,
    after: await entries()
  })

  await frame.locator(".row-button", { hasText: "CompletedUploadFile" }).first()
    .waitFor({ timeout: 10_000 })
  const finished = await scene()
  expect(
    !finished.liveShown,
    "the live root stays hidden while the upload finishes",
    finished
  )
  expect(
    finished.copy?.[0]?.includes("Uploading"),
    "the copy keeps the painted state",
    finished
  )
  expect(
    finished.live[0]?.includes("Done"),
    "the live root finished the upload unseen",
    finished
  )

  await frame.getByRole("button", { name: "Resume the live page" }).click({
    timeout: 5_000
  })
  await page.waitForTimeout(100)
  const resumed = await scene()
  expect(
    resumed.copy === null && resumed.liveShown,
    "Resume removes the copy and shows the live root",
    resumed
  )
  expect(
    resumed.live[0]?.includes("Done"),
    "the finished upload shows on Resume",
    resumed
  )
  await page.getByRole("button", { name: "Upload a file" }).click({
    timeout: 5_000
  })
  await page.getByRole("button", { name: "Cancel upload 1" }).waitFor({
    timeout: 5_000
  })

  await checkMcp(frame, scene)
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
  await server.close()
}
for (const failure of failures) console.log(failure)
console.log(
  failures.length === 0
    ? "devtools: " + checks + " checks ok"
    : "devtools: " + failures.length + " failed"
)
process.exitCode = failures.length === 0 ? 0 : 1
