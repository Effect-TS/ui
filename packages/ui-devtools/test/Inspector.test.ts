import { Inspector } from "@effect/ui-devtools"
import * as MessageLog from "@effect/ui/MessageLog"
import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import * as fs from "node:fs"

type Entry = MessageLog.WireEntry
type Update = Extract<Entry, { readonly _tag: "Update" }>
type Capture = "interrupted" | "open" | "closed" | "switched"

const decode = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Array(MessageLog.Wire)))
const traces = decode(
  JSON.parse(fs.readFileSync(new URL("./fixtures/two-editor-traces.wire-v8.json", import.meta.url), "utf8"))
)
const frames = (capture: Capture): ReadonlyArray<Entry> =>
  traces[capture].filter((frame): frame is Entry => frame._tag !== "Hello")

const load = (capture: Capture, size?: number) => {
  const inspector = Inspector.make({ size })
  inspector.ingest(frames(capture))
  const session = inspector.sessions()[0]
  const entries = session.entries()
  const instanceOf = (label: string) => session.instances().find((instance) => instance.path.endsWith(label))!
  const updates = (label: string, message: string) =>
    entries.filter((entry): entry is Update =>
      entry._tag === "Update" && entry.path.endsWith(label) && (entry.message as { _tag: string })._tag === message
    )
  const entry = <Tag extends Entry["_tag"]>(seq: number | undefined, tag: Tag) => {
    const resolved = session.resolve(seq!)
    assert.strictEqual(resolved._tag, tag)
    return resolved as Extract<Entry, { readonly _tag: Tag }>
  }
  const commandReasons = (label: string) =>
    session.records(instanceOf(label).instance).filter((record) => record.kind === "command").map((record) =>
      record.reason
    )
  return { inspector, session, entries, instanceOf, updates, entry, commandReasons }
}

describe("Inspector", () => {
  it("follows Editor[n2]'s Save to the Escape that interrupted it, and back", () => {
    const { commandReasons, entry, instanceOf, session, updates } = load("interrupted")
    const n2 = instanceOf("Editor[n2]")

    assert.strictEqual(session.app, "Workspace")
    assert.deepStrictEqual(commandReasons("Editor[n1]"), ["ended"])
    assert.deepStrictEqual(commandReasons("Editor[n2]"), ["interrupt"])
    assert.strictEqual(instanceOf("Editor[n1]").unmounted, undefined)

    const [save] = updates("Editor[n2]", "ClickedSave")
    assert.deepStrictEqual(save.source, { _tag: "DomEvent", name: "click" })
    assert.strictEqual(save.commands[0].name, "notes/SaveNote")
    const run = session.run({ seq: save.seq, index: 0 })!
    const started = entry(run.start, "CommandStarted")
    assert.match(started.spanId, /^[0-9a-f]{16}$/)
    const interrupted = entry(run.end, "CommandInterrupted")
    assert.strictEqual(interrupted.reason, "interrupt")
    assert.strictEqual(run.reason, "interrupt")

    const escape = entry(interrupted.causedBy, "Update")
    assert.deepStrictEqual(escape.message, { _tag: "PressedEscape" })
    assert.strictEqual(escape.instance, n2.instance)
    assert.deepStrictEqual(escape.commands, [{
      _tag: "Interrupt",
      name: "notes/SaveNote",
      group: save.commands[0].group,
      args: null
    }])
    const source = session.back(escape.seq).find((link) => link.rel === "source")
    const subscription = entry(source?.seq, "SubscriptionStarted")
    assert.strictEqual(subscription.instance, n2.instance)
    assert.strictEqual(subscription.name, "@effect/ui/html/document")
    assert.deepStrictEqual(subscription.deps, ["keydown"])

    assert.strictEqual(entry(interrupted.issued.seq, "Update"), save)
    assert.deepStrictEqual(session.forward(save.seq), [
      { rel: "causedBy", seq: started.seq },
      { rel: "issued", seq: started.seq, index: 0 },
      { rel: "issued", seq: interrupted.seq, index: 0 }
    ])
    assert.deepStrictEqual(session.forward(escape.seq), [{ rel: "causedBy", seq: interrupted.seq }])

    const previous = session.previous(save.seq)!
    const before = entry(previous.seq, "Update")
    assert.deepStrictEqual(before.message, { _tag: "UpdatedDraft", text: "Follow the command" })
    assert.strictEqual(previous.changed, true)
    assert.deepStrictEqual(Inspector.diff(before.model, save.model), [
      { kind: "changed", path: ["status"], before: "Dirty", after: "Saving" }
    ])
    assert.deepStrictEqual(Inspector.diff(before.props, save.props), [
      { kind: "unknown", path: ["token"], before: { "~redacted": true }, after: { "~redacted": true } }
    ])

    const lifecycle = session.records(n2.instance).filter((record) => record.kind !== "command")
    assert.deepStrictEqual(lifecycle.map((record) => [record.kind, record.name, record.reason]), [
      ["layer", "Editor", "ready"],
      ["subscription", "@effect/ui/html/document", "unmount"],
      ["mount", "FocusBody", "completed"]
    ])
    assert.strictEqual(lifecycle[1].end, n2.unmounted)
    entry(n2.unmounted, "Unmounted")
  })

  it("reads the other captures as unmount, switch and still running", () => {
    const closed = load("closed")
    const [closedSave] = closed.updates("Editor[n2]", "ClickedSave")
    const unmounted = closed.entry(closed.session.run({ seq: closedSave.seq, index: 0 })!.end, "CommandInterrupted")
    assert.strictEqual(unmounted.reason, "unmount")
    assert.deepStrictEqual(closed.entry(unmounted.causedBy, "Update").message, { _tag: "ClickedClose", noteId: "n2" })
    assert.strictEqual(
      closed.entry(closed.instanceOf("Editor[n2]").unmounted, "Unmounted").causedBy,
      unmounted.causedBy
    )

    const switched = load("switched")
    const [first, second] = switched.updates("Editor[n2]", "ClickedSave")
    const cut = switched.entry(switched.session.run({ seq: first.seq, index: 0 })!.end, "CommandInterrupted")
    assert.strictEqual(cut.reason, "switch")
    assert.strictEqual(cut.causedBy, second.seq)
    assert.deepStrictEqual(switched.commandReasons("Editor[n2]"), ["switch", undefined])

    const open = load("open")
    const [hung] = open.updates("Editor[n2]", "ClickedSave")
    const run = open.session.run({ seq: hung.seq, index: 0 })!
    assert.match(open.entry(run.start, "CommandStarted").spanId, /^[0-9a-f]{16}$/)
    assert.strictEqual(run.end, undefined)
    assert.strictEqual(run.reason, undefined)
  })

  it("keeps each interruption reason, and gives no start to a run the log has none for", () => {
    const base = { session: "s", path: "/App", instance: 1, component: "App" }
    const reasons = ["interrupt", "switch", "unmount", "layer", "self"] as const
    const command = { _tag: "Effect" as const, name: "Save", group: null, args: null }
    const issue: Entry = {
      ...base,
      _tag: "Update",
      seq: 1,
      at: 0,
      source: { _tag: "Dispatch" },
      message: null,
      props: null,
      model: null,
      commands: [...reasons.map(() => command), command],
      events: [],
      lists: [],
      sends: []
    }
    const started: Entry = {
      ...base,
      _tag: "CommandStarted",
      seq: 2,
      at: 1,
      name: "Save",
      issued: { seq: 1, index: 0 },
      spanId: "a",
      traceId: "b"
    }
    const interrupted = (seq: number, issued: MessageLog.Issued, reason: MessageLog.InterruptReason): Entry => ({
      ...base,
      _tag: "CommandInterrupted",
      seq,
      at: 2,
      name: "Save",
      issued,
      spanId: issued.index === 0 ? "a" : null,
      traceId: issued.index === 0 ? "b" : null,
      reason
    })
    const inspector = Inspector.make()
    inspector.ingest([
      issue,
      started,
      ...reasons.map((reason, index) => interrupted(3 + index, { seq: 1, index }, reason)),
      interrupted(8, { seq: 0, index: 0 }, "interrupt")
    ])
    const session = inspector.sessions()[0]

    assert.deepStrictEqual(
      session.records(1).map((record) => [record.issued?.index, record.start, record.end, record.reason]),
      [
        [0, 2, 3, "interrupt"],
        [1, undefined, 4, "switch"],
        [2, undefined, 5, "unmount"],
        [3, undefined, 6, "layer"],
        [4, undefined, 7, "self"],
        [5, undefined, undefined, undefined]
      ]
    )
    assert.strictEqual(session.run({ seq: 0, index: 0 }), undefined)
  })

  it("drops entries past its size and keeps what is still open", () => {
    const { entries, inspector, instanceOf, session } = load("interrupted", 6)
    const n1 = instanceOf("Editor[n1]")

    assert.deepStrictEqual(entries.map((entry) => entry.seq), [24, 25, 26, 27, 28, 29])
    assert.deepStrictEqual(session.resolve(21), { _tag: "Outside", seq: 21 })
    assert.deepStrictEqual(session.forward(21), [{ rel: "issued", seq: 27, index: 0 }])
    assert.deepStrictEqual(
      session.records(n1.instance).map((record) => [record.kind, record.start, record.end, record.reason]),
      [["subscription", 5, undefined, undefined], ["command", 19, 24, "ended"]]
    )

    inspector.ingest(frames("interrupted"))
    assert.strictEqual(session.entries().length, 6)

    session.clear()
    assert.deepStrictEqual(session.entries(), [])
    assert.deepStrictEqual(
      session.instances().map((instance) => instance.path),
      ["/Workspace", "/Workspace/Editor[n1]"]
    )
    assert.deepStrictEqual(session.records().map((record) => [record.kind, record.start]), [["subscription", 5]])
  })

  it("diffs nested values by key and by index", () => {
    assert.deepStrictEqual(
      Inspector.diff(
        { open: ["n1", "n2"], draft: { text: "a" }, saved: null },
        { open: ["n1"], draft: { text: "a", size: 1 }, viewers: 2 }
      ),
      [
        { kind: "removed", path: ["open", 1], before: "n2" },
        { kind: "added", path: ["draft", "size"], after: 1 },
        { kind: "removed", path: ["saved"], before: null },
        { kind: "added", path: ["viewers"], after: 2 }
      ]
    )
  })
})
