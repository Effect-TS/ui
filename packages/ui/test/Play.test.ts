import { Command, Component, Subscription, UiSchema } from "@effect/ui"
import { Case, Locator, Play, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  PubSub,
  Queue,
  Schema,
  Stream
} from "effect"
import { TestClock } from "effect/testing"
import { SearchBox } from "./fixtures/components.ts"

const SaverMessage = UiSchema.TaggedEnum({ ClickedSave: {}, SucceededSave: {} })
const SaverEvents = UiSchema.TaggedEnum({ Saved: {} })

class Save extends Command.Service<Save>()(
  "Saver/Save",
  { args: {}, success: SaverMessage }
) {
  static readonly layer = this.toLayer(() =>
    Effect.as(Effect.sleep("1 second"), SaverMessage.SucceededSave())
  )
}

const Saver = Component.define({
  name: "Saver",
  model: Schema.Null,
  message: SaverMessage,
  events: SaverEvents
}).make({
  init: () => null,
  update: ($, message) =>
    SaverMessage.match(message, {
      ClickedSave: () => $.run(Save.make({})),
      SucceededSave: () => $.emit(SaverEvents.Saved())
    }),
  view: (h) =>
    h.el("button").on("click", SaverMessage.ClickedSave()).children("Save")
})

const Page = Component.define({
  name: "Page",
  model: Schema.Number,
  message: Schema.Literals(["Saved", "Ignored"])
}).make({
  init: () => 0,
  update: ($, message) => message === "Saved" ? $.model + 1 : $.model,
  view: (h, saves) =>
    h.el("div").children(
      Saver(h, { props: {}, onEmit: () => "Saved" }),
      h.el("button").on("click", () => undefined).children("Nothing"),
      h.el("p").children(`saves: ${saves}`)
    )
}).pipe(Component.provide(Save.layer))

const saves = Locator.tag("p")

const failureOf = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "succeeded"

it.layer(TestHost.layer(), { buildPerTest: true })("Play", (it) => {
  it.effect("runs a child's real Command, and picks up the clock at the next step", () =>
    Effect.gen(function*() {
      const play = yield* Play.make(Page, {})
      yield* play.click("Save")
      yield* play.expect(saves).toHaveText("saves: 0")
      yield* TestClock.adjust("1 second")
      yield* play.expect(saves).toHaveText("saves: 1")
      assert.strictEqual(play.root.model(), 1)
    }))

  it.effect("an interaction that produced no message must be acknowledged before the next and at the end", () =>
    Effect.gen(function*() {
      const play = yield* Play.make(Page, {})
      yield* play.click("Nothing")
      assert.match(
        failureOf(yield* Effect.exit(play.click("Save"))),
        /Play\.click: the click before it produced no message: acknowledge it with expectIgnored\(\)/
      )
      yield* play.expectIgnored()
      yield* play.click("Save")
      assert.match(
        failureOf(yield* Effect.exit(play.expectIgnored())),
        /the last interaction produced a message/
      )

      const unacknowledged = yield* Effect.exit(Effect.scoped(Effect.andThen(
        Play.make(Page, {}),
        (play) => play.click("Nothing")
      )))
      assert.match(
        failureOf(unacknowledged),
        /Play\.make: the last click produced no message/
      )
    }))

  it.effect("a failed expectation lists the tree's elements", () =>
    Effect.gen(function*() {
      const play = yield* Play.make(Page, {})
      yield* play.expect(saves).toHaveAttribute("data-missing", false)
      assert.match(
        failureOf(
          yield* Effect.exit(play.expect(saves).toHaveText("saves: 9"))
        ),
        /Play\.expect\(<p>\)\.toHaveText\("saves: 9"\): its text is "saves: 0"; elements:\n  <div>/
      )
    }))

  it.effect("settles a shared backend layer's worker across mounted roots", () => {
    class Backend extends Context.Service<
      Backend,
      {
        readonly save: (value: number) => Effect.Effect<void>
        readonly values: Stream.Stream<number>
      }
    >()("Play/Backend") {
      static readonly layer = Layer.effect(
        this,
        Effect.gen(function*() {
          const queue = yield* Queue.unbounded<number>()
          const pubsub = yield* PubSub.unbounded<number>({ replay: 1 })
          yield* PubSub.publish(pubsub, 0)
          yield* Effect.forkScoped(
            Effect.forever(
              Effect.flatMap(
                Queue.take(queue),
                (value) => PubSub.publish(pubsub, value)
              )
            )
          )
          return {
            save: (value) => Effect.asVoid(Queue.offer(queue, value)),
            values: Stream.fromPubSub(pubsub)
          }
        })
      )
    }

    const PanelMessage = UiSchema.TaggedEnum({
      ClickedSave: {},
      ReceivedValue: { value: Schema.Number }
    })

    class SaveValue extends Command.Service<SaveValue>()(
      "Panel/SaveValue",
      { args: { value: Schema.Number } }
    ) {
      static readonly layer = this.toLayer(
        Backend.useSync((backend) => ({ value }) => backend.save(value))
      )
    }

    const Panel = Component.define({
      name: "Panel",
      model: Schema.Number,
      message: PanelMessage
    }).make({
      init: () => -1,
      update: ($, message) =>
        PanelMessage.match(message, {
          ClickedSave: () => $.run(SaveValue.make({ value: 7 })),
          ReceivedValue: ({ value }) => value
        }),
      subscriptions: () => [
        Subscription.make(
          "values",
          Stream.unwrap(
            Backend.useSync((backend) =>
              Stream.map(
                backend.values,
                (value) => PanelMessage.ReceivedValue({ value })
              )
            )
          )
        )
      ],
      view: (h, value) =>
        h.el("div").children(
          h.el("button").on("click", PanelMessage.ClickedSave()).children(
            "Save"
          ),
          h.el("p").children(String(value))
        )
    })

    const value = Locator.tag("p")
    const backendLayer = SaveValue.layer.pipe(Layer.provideMerge(Backend.layer))

    return Effect.gen(function*() {
      const first = yield* Play.make(Panel, {})
      const second = yield* Play.make(Panel, {})
      yield* first.expect(value).toHaveText("0")
      yield* second.expect(value).toHaveText("0")
      yield* first.click("Save")
      yield* first.expect(value).toHaveText("7")
      yield* second.expect(value).toHaveText("7")
    }).pipe(Effect.provide(backendLayer))
  })

  it.effect("fromCase starts from the case's model or sends its messages, with its layer", () =>
    Effect.gen(function*() {
      class InitialId extends Context.Service<InitialId, string>()(
        "InitialId"
      ) {}

      const ItemMessage = UiSchema.TaggedEnum({
        Loaded: {},
        ClickedSave: {},
        CompletedSave: {}
      })

      class LoadItem extends Command.Service<LoadItem>()(
        "Item/Load",
        { args: {}, success: ItemMessage }
      ) {}

      class SaveItem extends Command.Service<SaveItem>()(
        "Item/Save",
        { args: { id: Schema.String }, success: ItemMessage }
      ) {}

      const Item = Component.define({
        name: "Item",
        props: Schema.Struct({ id: Schema.String }),
        model: Schema.Struct({ saved: Schema.Boolean, loaded: Schema.Boolean }),
        message: ItemMessage
      }).make({
        init: ($) =>
          $.set({ saved: false, loaded: false }).run(LoadItem.make({})),
        update: ($, message) =>
          ItemMessage.match(message, {
            Loaded: () => ({ ...$.model, loaded: true }),
            ClickedSave: () => $.run(SaveItem.make({ id: $.props.id })),
            CompletedSave: () => ({ ...$.model, saved: true })
          }),
        view: (h, model) =>
          h.el(
            "p",
            `${h.props.id}:${
              model.saved ? "saved" : h.isRunning(SaveItem) ? "saving" : "empty"
            }`
          )
      })

      let initLoads = 0
      const LoadLayer = LoadItem.toLayer(() =>
        Effect.sync(() => {
          initLoads++
          return ItemMessage.Loaded()
        })
      )
      const SavePending = SaveItem.toLayer(() => Effect.never)

      const cases = Case.make(Item, {
        saved: {
          props: { id: "t1" },
          model: { saved: true, loaded: false },
          layer: Layer.mergeAll(LoadLayer, SavePending)
        },
        saving: {
          props: Effect.gen(function*() {
            return { id: yield* InitialId }
          }),
          messages: [ItemMessage.ClickedSave()],
          layer: Layer.mergeAll(
            LoadLayer,
            SavePending,
            Layer.succeed(InitialId, "t2")
          )
        },
        unset: {
          props: { id: "t4" },
          model: undefined,
          layer: Layer.mergeAll(LoadLayer, SavePending)
        }
      })

      assert.strictEqual(cases.saved.name, "Item/saved")
      assert.strictEqual(cases.saved.component, Item)

      const saved = yield* Play.fromCase(cases.saved)
      yield* saved.expect(Locator.tag("p")).toHaveText("t1:saved")
      assert.strictEqual(initLoads, 0)

      const saving = yield* Play.fromCase(cases.saving)
      yield* saving.expect(Locator.tag("p")).toHaveText("t2:saving")

      // `model: undefined` counts as left out: `init` runs.
      const unset = yield* Play.fromCase(cases.unset)
      assert.deepStrictEqual(unset.root.model(), { saved: false, loaded: true })
      assert.deepStrictEqual(
        Case.make(SearchBox, { idle: { props: undefined } }).idle.props,
        {}
      )
      const Nullable = Component.define({
        name: "Nullable",
        props: Schema.NullOr(Schema.String),
        model: Schema.Struct({}),
        message: Schema.Never
      }).make({
        init: () => ({}),
        update: ($) => $.model,
        view: (h) => h.el("p")
      })
      assert.isNull(Case.make(Nullable, { empty: { props: null } }).empty.props)
    }))
})
