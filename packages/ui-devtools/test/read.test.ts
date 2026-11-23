import { Command, Component, UiSchema } from "@effect/ui"
import { Inspector } from "@effect/ui-devtools"
import * as Read from "@effect/ui-devtools/internal/read"
import * as MessageLog from "@effect/ui/MessageLog"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

describe("Read.chainOf", () => {
  it.effect("credits each interrupt with the run of its own group", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({ Escaped: {}, Saved: {} })
      const Save = Command.make("test/Save", { args: { id: Schema.String }, group: ["id"] }, () => Effect.never)
      const save = (id: string) => Save.make({ id }).pipe(Command.map(() => Message.Saved()))
      const Editor = Component.define({ name: "Editor", scoped: false, model: Schema.Null, message: Message }).make({
        init: ($) => $.set(null).run(save("a")).run(save("b")),
        update: {
          Escaped: (model, _message, $) =>
            $.set(model).run(Command.interrupt(Save, { id: "b" })).run(Command.interrupt(Save, { id: "a" })),
          Saved: (model) => model
        },
        view: (_, h) => h.text("editor")
      })
      const root = yield* TestHost.mount(Editor, {})
      yield* TestHost.settle
      root.send(Message.Escaped())
      yield* TestHost.settle
      const encoder = MessageLog.makeEncoder()
      const inspector = Inspector.make()
      inspector.ingest(root.log().map((entry) => encoder.encode(entry)))
      const session = inspector.sessions()[0]
      const entries = session.entries()
      const escaped = entries.find((entry) => entry._tag === "Update")!
      const ended = (id: string) =>
        entries.find((entry) => {
          if (entry._tag !== "CommandInterrupted") return false
          const issuing = session.resolve(entry.issued.seq)
          return Read.isIssuing(issuing) && issuing.commands[entry.issued.index]?.group?.includes(id) === true
        })!.seq

      const chain = Read.chainOf(session, escaped)
      const stopped = chain.flatMap((step) =>
        step._tag === "Command" ? [[step.index, step.stopped.map((ref) => ref.seq)] as const] : []
      )
      assert.deepStrictEqual(stopped, [[0, [ended("b")]], [1, [ended("a")]]])
      const entry = chain.find((step) => step._tag === "Entry")!
      assert.deepStrictEqual(entry._tag === "Entry" ? entry.stopped : undefined, [])
    }).pipe(Effect.provide(TestHost.layer())))
})
