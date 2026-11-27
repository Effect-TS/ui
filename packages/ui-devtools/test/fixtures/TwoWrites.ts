import { Command, Component, Subscription, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { Effect, Queue, Redacted, Schema, Stream } from "effect"

const wait = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

const until = (check: () => boolean) =>
  Effect.suspend(function loop(): Effect.Effect<void> {
    return check()
      ? Effect.void
      : Effect.andThen(wait(10), Effect.suspend(loop))
  }).pipe(Effect.timeout("2 seconds"))

export const secret = "tok_write_secret"

export const playTwoWrites = Effect.fnUntraced(function*() {
  type Confirmation = { readonly commandId: string; readonly attempt: number }
  const listeners = new Set<(event: Confirmation) => void>()

  const Write = Command.make(
    "writes/Write",
    {
      args: {
        commandId: Schema.String,
        secret: Schema.Redacted(Schema.String)
      }
    },
    ({ commandId }) =>
      Effect.sync(() => {
        for (const emit of listeners) emit({ commandId, attempt: 1 })
        return Component.noop
      })
  )

  const FeedMessage = UiSchema.TaggedEnum({
    Confirmed: { commandId: Schema.String, attempt: Schema.Number }
  })

  const Feed = Html.component({
    name: "Feed",
    model: Schema.Struct({ last: Schema.String }),
    message: FeedMessage
  }).make({
    init: () => ({ last: "" }),
    update: { Confirmed: ($, { commandId }) => $.evolve({ last: commandId }) },
    subscriptions: () => [
      Subscription.make(
        "writes/confirmations",
        Stream.callback<typeof FeedMessage.Type>((queue) =>
          Effect.gen(function*() {
            const emit = (event: Confirmation) => {
              Queue.offerUnsafe(queue, FeedMessage.Confirmed(event))
            }
            listeners.add(emit)
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => listeners.delete(emit))
            )
          })
        )
      )
    ],
    view: (h, model) => h.output(model.last)
  })

  const BoardMessage = UiSchema.TaggedEnum({ ClickedWrite: {} })

  const Board = Html.component({
    name: "Board",
    model: Schema.Struct({ next: Schema.Number }),
    message: BoardMessage
  }).make({
    init: () => ({ next: 1 }),
    update: {
      ClickedWrite: ($) =>
        $.evolve({ next: $.model.next + 1 }).run(
          Write.make({
            commandId: "cmd-" + $.model.next,
            secret: Redacted.make(secret)
          })
        )
    },
    view: (h) =>
      h.main(
        h.button.on("click", BoardMessage.ClickedWrite()).children("Write"),
        Feed(h, { key: "a", props: {} }),
        Feed(h, { key: "b", props: {} })
      )
  })

  const app = document.body.appendChild(document.createElement("div"))
  yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
  yield* BrowserHost.mountEffect(Board, {}, app)
  yield* until(() => listeners.size === 2)

  const write = HtmlLocator.getByRole(app, "button", { name: "Write" })
  const confirmed = (id: string) => {
    const outputs = Array.from(app.querySelectorAll("output"))
    return outputs.length === 2 &&
      outputs.every((node) => node.textContent === id)
  }

  HtmlLocator.click(write)
  yield* until(() => confirmed("cmd-1"))
  HtmlLocator.click(write)
  yield* until(() => confirmed("cmd-2"))
  yield* wait(20)
})
