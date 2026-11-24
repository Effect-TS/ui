// @vitest-environment happy-dom
import { DevTools } from "@effect/ui-devtools"
import { DevToolsServer } from "@effect/ui-devtools/node"
import { HtmlLocator } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { request } from "node:http"
import { type Capture, play } from "./fixtures/TwoEditors.ts"

const wait = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
const token = "tok_live_9f2c"

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim()
const overlay = () =>
  document.querySelector<HTMLIFrameElement>("iframe[data-effect-ui-devtools]")!
    .contentDocument!.body

const parse = (body: string): any => {
  if (body === "") return undefined
  if (!body.startsWith("event:") && !body.startsWith("data:")) {
    return JSON.parse(body)
  }
  const data = body.split("\n").filter((line) => line.startsWith("data:")).map((
    line
  ) => line.slice(5)).join("")
  return JSON.parse(data)
}

// happy-dom's fetch applies CORS, so the agent and the probes use node:http.
const send = (
  url: string,
  options: {
    readonly method?: string
    readonly headers: Record<string, string>
  },
  body = ""
) =>
  new Promise<
    {
      status: number
      headers: Record<string, string | Array<string> | undefined>
      body: string
    }
  >(
    (resolve, reject) => {
      const req = request(url, options, (res) => {
        let text = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => text += chunk)
        res.on(
          "end",
          () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: text
            })
        )
      })
      req.on("upgrade", (res, socket) => {
        socket.destroy()
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: "" })
      })
      req.on("error", reject)
      req.end(body)
    }
  )

const makeAgent = async (base: string) => {
  let session: string | undefined
  let id = 0
  const results: Array<string> = []
  const post = async (body: object, headers: Record<string, string> = {}) => {
    const response = await send(base + "/mcp", {
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
      }
    }, JSON.stringify(body))
    const sid = response.headers["mcp-session-id"]
    session = typeof sid === "string" ? sid : session
    return { status: response.status, json: parse(response.body) }
  }
  await post({
    jsonrpc: "2.0",
    id: ++id,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" }
    }
  })
  await post({ jsonrpc: "2.0", method: "notifications/initialized" })
  const call = async (name: string, args: object = {}) => {
    const { json } = await post({
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name, arguments: args }
    })
    results.push(JSON.stringify(json))
    if (json.error !== undefined) throw new Error(JSON.stringify(json.error))
    return json.result
  }
  return {
    post,
    results,
    tools: async () =>
      (await post({ jsonrpc: "2.0", id: ++id, method: "tools/list" })).json
        .result.tools,
    call: async (name: string, args?: object) => {
      const result = await call(name, args)
      if (result.isError === true) {
        throw new Error(result.content?.[0]?.text ?? JSON.stringify(result))
      }
      return result.structuredContent.result
    },
    fails: async (name: string, args?: object): Promise<string> => {
      const result = await call(name, args)
      assert.isTrue(result.isError, name + " should fail")
      return JSON.stringify(result.content ?? result.structuredContent)
    }
  }
}

type Agent = Awaited<ReturnType<typeof makeAgent>>

const serve = Effect.fnUntraced(
  function*(options: DevToolsServer.Options & { readonly port: number }) {
    yield* Layer.build(DevToolsServer.layer(options))
    const url = DevToolsServer.url(options)
    return { url, agent: yield* Effect.promise(() => makeAgent(url)) }
  }
)

const open = Effect.fnUntraced(
  function*(url: string, capture: Capture, size?: number) {
    localStorage.clear()
    const services = yield* Layer.build(
      DevTools.layer({ server: url, ...(size === undefined ? {} : { size }) })
    )
    const app = yield* play(capture).pipe(Effect.provide(services))
    yield* wait(150)
    return app
  }
)

const ask = <A = any>(agent: Agent, name: string, args?: object) =>
  Effect.promise((): Promise<A> => agent.call(name, args))
const refused = (agent: Agent, name: string, args?: object) =>
  Effect.promise(() => agent.fails(name, args))

const until = (check: () => boolean) =>
  Effect.suspend(function loop(): Effect.Effect<void> {
    return check()
      ? Effect.void
      : Effect.andThen(wait(10), Effect.suspend(loop))
  }).pipe(Effect.timeout("2 seconds"))

describe("DevToolsServer", { concurrent: false }, () => {
  it.live(
    "answers why a save never finished from the server's copy of the log",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ port: 47741 })
        yield* open(url, "interrupted")

        const tools: ReadonlyArray<any> = yield* Effect.promise(() =>
          agent.tools()
        )
        assert.deepStrictEqual(tools.map((tool) => tool.name), [
          "list_sessions",
          "list_instances",
          "list_entries",
          "count_entries",
          "get_entry",
          "get_chain",
          "get_state",
          "diff_state",
          "show_entry",
          "resume",
          "get_message_schema",
          "dispatch",
          "wait"
        ])
        assert.isTrue(
          tools.find((tool) => tool.name === "dispatch").annotations
            .destructiveHint
        )
        assert.isTrue(
          tools.find((tool) => tool.name === "get_state").annotations
            .readOnlyHint
        )

        const [session] = yield* ask(agent, "list_sessions")
        assert.strictEqual(session.app, "Workspace")
        assert.strictEqual(session.host, "browser")
        assert.isTrue(session.connected)
        assert.isTrue(session.controllable)

        const instances: ReadonlyArray<any> = yield* ask(
          agent,
          "list_instances"
        )
        const n2 = instances.find((instance) =>
          instance.path === "/Workspace/Editor[n2]"
        )
        assert.match(n2.status, /interrupted/)
        assert.isDefined(n2.unmounted)

        const { rows } = yield* ask(agent, "list_entries", {
          instance: n2.instance,
          filter: "commands"
        })
        const interrupted = rows.find((row: any) =>
          row.tag === "CommandInterrupted"
        )
        const save = rows.find((row: any) => row.label === "ClickedSave")
        assert.isDefined(interrupted)

        const chain: ReadonlyArray<any> = yield* ask(agent, "get_chain", {
          seq: interrupted.seq
        })
        const steps = JSON.stringify(chain)
        assert.include(steps, "ClickedSave")
        assert.include(steps, "PressedEscape")
        assert.include(steps, "notes/SaveNote")

        const diff = yield* ask(agent, "diff_state", { seq: save.seq })
        assert.deepInclude(diff.changes, {
          path: ["status"],
          kind: "changed",
          before: "Dirty",
          after: "Saving"
        })

        const state = yield* ask(agent, "get_state", {
          instance: n2.instance,
          at: save.seq
        })
        assert.strictEqual(state.model.status, "Saving")
        assert.deepStrictEqual(state.props.token, { "~redacted": true })
        const now = yield* ask(agent, "get_state", { instance: n2.instance })
        assert.match(now.unmounted, /^unmounted at #\d+$/)

        const counts = yield* ask(agent, "count_entries")
        assert.strictEqual(counts.messages.ClickedSave, 2)

        const entry = yield* ask(agent, "get_entry", {
          seq: save.seq,
          path: ["message"]
        })
        assert.deepStrictEqual(entry, { _tag: "ClickedSave" })
        assert.notInclude(agent.results.join("\n"), token)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "keeps the state of an instance whose entries the ring dropped",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ port: 47742, size: 12 })
        yield* open(url, "open", 12)
        const instances: ReadonlyArray<any> = yield* ask(
          agent,
          "list_instances"
        )
        const workspace = instances.find((instance) =>
          instance.path === "/Workspace"
        )
        const state = yield* ask(agent, "get_state", {
          instance: workspace.instance
        })
        assert.deepStrictEqual(state.model, { open: ["n1", "n2"] })
        const message = yield* refused(agent, "get_state", {
          instance: workspace.instance,
          at: 0
        })
        assert.include(message, "older than the last 12 entries")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "refuses browser origins on /mcp and foreign origins on the WebSocket routes",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ port: 47743 })
        const mcp = yield* Effect.promise(() =>
          agent.post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {
            origin: "http://evil.example"
          })
        )
        assert.strictEqual(mcp.status, 403)
        for (const path of ["/log", "/control"]) {
          const probe = (origin: string) =>
            Effect.promise(() =>
              send(url + path, {
                headers: {
                  connection: "Upgrade",
                  upgrade: "websocket",
                  "sec-websocket-version": "13",
                  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
                  origin
                }
              }).then((response) => response.status)
            )
          assert.strictEqual(yield* probe("http://evil.example"), 403, path)
          assert.strictEqual(yield* probe("http://localhost:5173"), 101, path)
        }
        const message = yield* refused(agent, "list_instances")
        assert.include(message, "No session has connected yet")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "shares one pause between an agent and the overlay",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ port: 47744 })
        const app = yield* open(url, "open")
        const root = overlay()
        const { rows } = yield* ask(agent, "list_entries", {
          tag: "ClickedSave"
        })
        const seq = rows[0].seq

        const shown = yield* ask(agent, "show_entry", { seq })
        assert.deepStrictEqual(shown, {
          paused: seq,
          fellBack: [],
          fallbacks: []
        })
        assert.strictEqual(app.style.display, "none")
        yield* until(() =>
          text(root.querySelector(".paused-label")) === "Paused at #" + seq
        )
        const [paused] = yield* ask(agent, "list_sessions")
        assert.strictEqual(paused.paused, seq)

        yield* ask(agent, "resume")
        assert.notStrictEqual(app.style.display, "none")
        yield* until(() => root.querySelector(".paused") === null)

        HtmlLocator.click(
          HtmlLocator.getByRole(root, "button", {
            name: "Open the Effect UI inspector"
          })
        )
        yield* wait(20)
        const saves = HtmlLocator.queryAllByRole(root, "button", {
          name: /Update ClickedSave$/
        })
          .filter((node) => node.classList.contains("row-button"))
        HtmlLocator.click(saves.at(-1)!)
        yield* wait(20)
        HtmlLocator.click(
          HtmlLocator.getByRole(root, "button", { name: "Time travel" })
        )
        yield* wait(50)
        const [human] = yield* ask(agent, "list_sessions")
        assert.strictEqual(
          "Paused at #" + human.paused,
          text(root.querySelector(".paused-label"))
        )
        yield* ask(agent, "resume")
        yield* until(() => root.querySelector(".paused") === null)

        const both: ReadonlyArray<number> = rows.map((row: any) => row.seq)
        yield* Effect.all(
          both.map((seq) => ask(agent, "show_entry", { seq })),
          { concurrency: "unbounded" }
        )
        const [raced] = yield* ask(agent, "list_sessions")
        assert.include(both, raced.paused)
        yield* until(() =>
          text(root.querySelector(".paused-label")) ===
            "Paused at #" + raced.paused
        )
        assert.strictEqual(document.querySelectorAll("[inert]").length, 1)
        yield* ask(agent, "resume")
        yield* until(() => root.querySelector(".paused") === null)
        assert.strictEqual(document.querySelectorAll("[inert]").length, 0)

        const outside = yield* refused(agent, "show_entry", { seq: 10_000 })
        assert.include(outside, "not in the session's buffer")
        const off = yield* refused(agent, "dispatch", {
          instance: 1,
          messages: [{ _tag: "ClickedSave" }]
        })
        assert.include(off, "Dispatch is off")
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "dispatches decoded messages to an instance and waits for their Commands",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ port: 47745, dispatch: true })
        const app = yield* open(url, "open")
        const instances: ReadonlyArray<any> = yield* ask(
          agent,
          "list_instances"
        )
        const n1 = instances.find((instance) =>
          instance.path === "/Workspace/Editor[n1]"
        ).instance

        const schema = yield* ask(agent, "get_message_schema", {
          instance: n1,
          tag: "UpdatedDraft"
        })
        assert.include(JSON.stringify(schema), "text")
        const unknownTag = yield* refused(agent, "get_message_schema", {
          instance: n1,
          tag: "Nope"
        })
        assert.include(unknownTag, "ClickedSave")

        const bad = yield* refused(agent, "dispatch", {
          instance: n1,
          messages: [{ _tag: "UpdatedDraft", text: "ok" }, {
            _tag: "UpdatedDraft",
            text: 1
          }]
        })
        assert.include(bad, "Message 1 does not decode")
        const { last } = yield* ask(agent, "wait", { timeout: 0, instance: n1 })

        const sent = yield* ask(agent, "dispatch", {
          instance: n1,
          messages: [{ _tag: "UpdatedDraft", text: "From the agent" }, {
            _tag: "ClickedSave"
          }]
        })
        assert.strictEqual(sent.applied, 2)
        assert.deepStrictEqual(
          sent.outcomes.map((outcome: any) =>
            outcome._tag
          ),
          ["Updated", "Updated"]
        )
        const update = yield* ask(agent, "get_entry", {
          seq: sent.outcomes[0].seq
        })
        assert.deepStrictEqual(update.source, { _tag: "Dispatch" })
        assert.strictEqual(
          (HtmlLocator.getByRole(app, "textbox", {
            name: "Body n1"
          }) as HTMLTextAreaElement).value,
          "From the agent"
        )

        const settled = yield* ask(agent, "wait", {
          since: last,
          instance: n1,
          timeout: 2_000
        })
        assert.isTrue(settled.settled)
        const state = yield* ask(agent, "get_state", { instance: n1 })
        assert.strictEqual(state.model.status, "Saved")

        const pending = yield* ask(agent, "wait", { timeout: 50 })
        assert.isFalse(pending.settled)
        assert.strictEqual(pending.open.length, 1)
      }).pipe(Effect.scoped),
    30_000
  )

  it.live(
    "keeps a closed session readable but not controllable",
    () =>
      Effect.gen(function*() {
        const { agent, url } = yield* serve({ port: 47746, keep: 1 })
        yield* open(url, "open").pipe(Effect.scoped)
        yield* wait(100)
        const [closed] = yield* ask(agent, "list_sessions")
        assert.isFalse(closed.connected)
        assert.isFalse(closed.controllable)
        const instances: ReadonlyArray<any> = yield* ask(
          agent,
          "list_instances"
        )
        assert.isAbove(instances.length, 0)
        const message = yield* refused(agent, "show_entry", {
          seq: closed.last
        })
        assert.include(message, "can't be controlled")

        yield* open(url, "open").pipe(Effect.scoped)
        yield* open(url, "open").pipe(Effect.scoped)
        yield* wait(100)
        const sessions: ReadonlyArray<any> = yield* ask(agent, "list_sessions")
        assert.strictEqual(sessions.length, 1)
        assert.notStrictEqual(sessions[0].session, closed.session)
      }).pipe(Effect.scoped),
    30_000
  )
})
