import { Command, Component, UiSchema } from "@effect/ui"
import { Inspector } from "@effect/ui-devtools"
import * as MessageLog from "@effect/ui/MessageLog"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as fs from "node:fs"

type Entry = MessageLog.WireEntry
type Update = Extract<Entry, { readonly _tag: "Update" }>
type Capture = "interrupted" | "open" | "closed" | "switched"

const decode = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Array(MessageLog.Wire)))
const traces = decode(
  JSON.parse(fs.readFileSync(new URL("./fixtures/two-editor-traces.wire-v1.json", import.meta.url), "utf8"))
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

  it.effect("ends only the run a Failed names, of two running the same Command", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Saved: {} })
      const Save = Command.make(
        "test/Save",
        { args: { id: Schema.String } },
        ({ id }) => id === "b" ? Effect.die("boom") : Effect.never
      )
      const save = (id: string) => Save.make({ id }).pipe(Command.map(() => Message.Saved()))
      const Editor = Component.define({ name: "Editor", scoped: false, model: Schema.Null, message: Message }).make({
        init: ($) => $.set(null).run(save("a")).run(save("b")),
        update: ($) => $.model,
        view: (h) => h.text("editor")
      })
      const root = yield* TestHost.mount(Editor, {})
      yield* Effect.exit(TestHost.settle)
      const encoder = MessageLog.makeEncoder()
      const logged = root.log().map((entry) => encoder.encode(entry))
      const failed = logged.find((frame) => frame._tag === "Failed")!
      const before = logged.filter((frame) => frame.seq < failed.seq)
      const mounted = before.find((frame) => frame._tag === "Mounted")!
      const linked: Inspector.Link = { rel: "issued", seq: failed.seq, index: 1 }
      const runs = (session: Inspector.Session) =>
        session.records().map((record) => [record.name, record.issued?.index, record.end, record.reason])

      const inspector = Inspector.make()
      inspector.ingest([...before, failed])
      const session = inspector.sessions()[0]
      assert.deepStrictEqual(runs(session), [
        ["test/Save", 0, undefined, undefined],
        ["test/Save", 1, failed.seq, "failed"]
      ])
      assert.deepInclude(session.back(failed.seq), { rel: "issued", seq: mounted.seq, index: 1 })
      assert.deepInclude(session.forward(mounted.seq), linked)

      inspector.ingest(logged)
      const other = session.run({ seq: mounted.seq, index: 0 })!
      assert.deepStrictEqual([session.resolve(other.end!)._tag, other.reason], ["CommandInterrupted", "unmount"])
      assert.strictEqual(session.run({ seq: mounted.seq, index: 1 })!.end, failed.seq)

      const { issued: _, ...unlinked } = failed as Extract<Entry, { readonly _tag: "Failed" }>
      const unnamed = Inspector.make()
      unnamed.ingest([...before, unlinked])
      assert.deepStrictEqual(runs(unnamed.sessions()[0]), [
        ["test/Save", 0, undefined, undefined],
        ["test/Save", 1, undefined, undefined]
      ])
      assert.notDeepInclude(unnamed.sessions()[0].forward(mounted.seq), linked)
    }).pipe(Effect.provide(TestHost.layer())))

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

  it("compares a Model only with a state entry the buffer holds", () => {
    const full = load("interrupted")
    const [last] = full.updates("Editor[n1]", "PressedEscape")
    const later = (seq: number): Entry => ({ ...last, seq })

    const small = load("interrupted", 3)
    assert.deepStrictEqual(small.session.resolve(last.seq), { _tag: "Outside", seq: last.seq })
    small.inspector.ingest([later(30), later(31)])
    assert.deepStrictEqual(small.session.previous(30), { seq: last.seq })
    assert.deepStrictEqual(small.session.previous(31), { seq: 30, changed: false })
    small.inspector.ingest([later(32), later(33)])
    assert.deepStrictEqual(small.session.resolve(30), { _tag: "Outside", seq: 30 })
    assert.deepStrictEqual(small.session.previous(31), { seq: 30, changed: false })

    full.session.clear()
    assert.deepStrictEqual(full.session.resolve(last.seq), { _tag: "Outside", seq: last.seq })
    full.inspector.ingest([later(30)])
    assert.deepStrictEqual(full.session.previous(30), {
      seq: last.seq,
      changed: false,
      model: last.model,
      props: last.props
    })
  })

  it("coalesces excluded updates per instance without evicting shown entries", () => {
    const base = (instance: number, path: string, component: string) => ({
      session: "s",
      path,
      instance,
      component
    })
    const mounted = (seq: number, instance: number, path: string, component: string, model: Schema.Json): Entry => ({
      ...base(instance, path, component),
      _tag: "Mounted",
      seq,
      at: seq,
      props: {},
      model,
      commands: [],
      events: [],
      adopted: false
    })
    const update = (
      seq: number,
      instance: number,
      path: string,
      component: string,
      tag: string,
      model: Schema.Json,
      causedBy?: number
    ): Entry => ({
      ...base(instance, path, component),
      _tag: "Update",
      seq,
      at: seq,
      ...(causedBy === undefined ? {} : { causedBy }),
      source: { _tag: "Dispatch" },
      message: { _tag: tag },
      props: {},
      model,
      commands: [],
      events: [],
      lists: [],
      sends: []
    })

    const inspector = Inspector.make({ size: 3, exclude: ["Moved"] })
    inspector.ingest([
      mounted(1, 1, "/A", "A", { x: 0, n: 0 }),
      mounted(2, 2, "/B", "B", { y: 0 }),
      update(3, 1, "/A", "A", "Clicked", { x: 0, n: 1 })
    ])
    const session = inspector.sessions()[0]
    assert.deepStrictEqual(session.entries().map((entry) => entry.seq), [1, 2, 3])

    for (let i = 1; i <= 20; i++) {
      inspector.ingest([update(3 + i, 1, "/A", "A", "Moved", { x: i, n: 1 })])
    }
    inspector.ingest([update(24, 2, "/B", "B", "Moved", { y: 5 }, 4)])
    assert.deepStrictEqual(session.entries().map((entry) => entry.seq), [1, 2, 3])
    assert.deepStrictEqual(session.resolve(4), { _tag: "Outside", seq: 4 })
    assert.strictEqual(session.resolve(23)._tag, "Update")
    assert.deepStrictEqual(session.back(24), [{ rel: "causedBy", seq: 4 }])
    assert.deepStrictEqual(session.resolve(session.back(24)[0].seq), { _tag: "Outside", seq: 4 })

    inspector.ingest([update(25, 2, "/B", "B", "Clicked", { y: 6 })])
    inspector.ingest([update(26, 1, "/A", "A", "Moved", { x: 99, n: 1 })])
    assert.strictEqual(session.resolve(23)._tag, "Update")
    assert.strictEqual(session.resolve(26)._tag, "Update")
    assert.deepStrictEqual(session.entries().map((entry) => entry.seq), [2, 3, 25])

    inspector.ingest([update(27, 1, "/A", "A", "Clicked", { x: 99, n: 2 })])
    assert.deepStrictEqual(session.entries().map((entry) => entry.seq), [3, 25, 27])
    assert.deepStrictEqual(session.previous(27), { seq: 26, changed: true })
    const before = session.resolve(26)
    assert.strictEqual(before._tag, "Update")
    assert.deepStrictEqual(Inspector.diff((before as Update).model, { x: 99, n: 2 }), [
      { kind: "changed", path: ["n"], before: 1, after: 2 }
    ])

    inspector.ingest([update(28, 1, "/A", "A", "Moved", { x: 100, n: 2 })])
    session.clear()
    assert.deepStrictEqual(session.entries(), [])
    inspector.ingest([update(29, 1, "/A", "A", "Clicked", { x: 100, n: 3 })])
    assert.deepStrictEqual(session.previous(29), {
      seq: 28,
      changed: true,
      model: { x: 100, n: 2 },
      props: {}
    })
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
