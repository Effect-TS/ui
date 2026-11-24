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

const mcp = async () => {
  let session
  let id = 0
  const post = async (body, headers = {}) => {
    const response = await fetch("http://127.0.0.1:4774/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(session === undefined
          ? {}
          : {
            "mcp-session-id": session,
            "mcp-protocol-version": "2025-06-18"
          }),
        ...headers
      },
      body: JSON.stringify(body)
    })
    session = response.headers.get("mcp-session-id") ?? session
    const text = await response.text()
    const data = text.startsWith("event:") || text.startsWith("data:")
      ? text.split("\n").filter((line) => line.startsWith("data:")).map((
        line
      ) => line.slice(5)).join("")
      : text
    return {
      status: response.status,
      json: data === "" ? undefined : JSON.parse(data)
    }
  }
  await post({
    jsonrpc: "2.0",
    id: ++id,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "check-devtools", version: "0" }
    }
  })
  await post({ jsonrpc: "2.0", method: "notifications/initialized" })
  const call = async (name, args = {}) => {
    const { json } = await post({
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name, arguments: args }
    })
    if (json.error !== undefined) {
      throw new Error(name + ": " + JSON.stringify(json.error))
    }
    return json.result
  }
  return {
    post,
    tools: async () =>
      (await post({ jsonrpc: "2.0", id: ++id, method: "tools/list" })).json
        .result.tools,
    call: async (name, args) => {
      const result = await call(name, args)
      if (result.isError) {
        throw new Error(name + ": " + result.content?.[0]?.text)
      }
      return result.structuredContent.result
    },
    error: async (name, args) => {
      const result = await call(name, args)
      return result.isError ? result.content?.[0]?.text ?? "" : undefined
    }
  }
}

const checkMcp = async (frame, scene) => {
  const agent = await mcp()
  const tools = await agent.tools()
  expect(
    tools.length === 13,
    "the MCP server lists 13 tools",
    tools.map((tool) => tool.name)
  )
  const origin = await agent.post({
    jsonrpc: "2.0",
    id: 0,
    method: "tools/list"
  }, { origin: "http://evil.example" })
  expect(
    origin.status === 403,
    "/mcp refuses a request with a browser Origin",
    origin.status
  )

  const sessions = await agent.call("list_sessions")
  const live = sessions.filter((session) => session.connected)
  expect(
    live.length === 1 && live[0].app === "Uploads" && live[0].controllable,
    "list_sessions has the page as one connected, controllable session",
    sessions
  )
  const [root] = await agent.call("list_instances")
  const completed = await agent.call("list_entries", {
    tag: "CompletedUploadFile"
  })
  const chain = JSON.stringify(
    await agent.call("get_chain", { seq: completed.rows[0]?.seq })
  )
  expect(
    chain.includes("ClickedStartUpload") &&
      chain.includes("uploads/UploadFile"),
    "get_chain leads a CompletedUploadFile back to its click and Command",
    chain
  )

  const starts = await agent.call("list_entries", { tag: "ClickedStartUpload" })
  const first = starts.rows[0].seq
  const shown = await agent.call("show_entry", { seq: first })
  await frame.locator(".paused-label", { hasText: "Paused at #" + first })
    .waitFor({ timeout: 5_000 })
  const painted = await scene()
  expect(
    shown.paused === first && !painted.liveShown && painted.copy?.length === 1,
    "show_entry paints the page at the entry and the panel shows it as paused",
    { shown, painted }
  )
  await frame.getByRole("button", { name: "Resume the live page" }).click({
    timeout: 5_000
  })
  await new Promise((resolve) => setTimeout(resolve, 200))
  const afterHuman = (await agent.call("list_sessions")).find((session) =>
    session.connected
  )
  expect(
    afterHuman.paused === undefined,
    "a person's Resume ends an agent's pause",
    afterHuman
  )

  const schema = JSON.stringify(
    await agent.call("get_message_schema", {
      instance: root.instance,
      tag: "ClickedCancelUpload"
    })
  )
  expect(
    schema.includes("uploadId"),
    "get_message_schema narrows to one message",
    schema
  )
  const wrong = await agent.error("dispatch", {
    instance: root.instance,
    messages: [{ _tag: "ClickedCancelUpload", uploadId: "one" }]
  })
  expect(
    wrong?.includes("does not decode"),
    "dispatch refuses a message that does not decode",
    wrong
  )

  const cancelled = await agent.call("dispatch", {
    instance: root.instance,
    messages: [{ _tag: "ClickedCancelUpload", uploadId: 1 }]
  })
  const cancel = await agent.call("get_entry", {
    seq: cancelled.outcomes[0]?.seq,
    path: ["message"]
  })
  await page.getByRole("button", { name: "Restart upload 1" }).waitFor({
    timeout: 5_000
  })
  expect(
    cancelled.applied === 1 && cancel._tag === "ClickedCancelUpload",
    "dispatch cancels the upload and returns the seq of its Update",
    { cancelled, cancel }
  )

  const started = await agent.call("dispatch", {
    instance: root.instance,
    messages: [{ _tag: "ClickedStartUpload" }]
  })
  const since = started.outcomes[0].seq - 1
  const waited = await agent.call("wait", { since, timeout: 10_000 })
  const state = await agent.call("get_state", { instance: root.instance })
  expect(
    waited.settled && state.model.uploads.at(-1)?.status === "Done",
    "wait returns once the dispatched upload's Command has ended",
    { waited, uploads: state.model.uploads }
  )
}

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
