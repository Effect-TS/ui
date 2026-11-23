// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const CounterMessage = UiSchema.TaggedEnum({ Clicked: {} })
const Counter = Component.define({
  name: "Counter",
  scoped: false,
  model: Schema.Number,
  message: CounterMessage,
  elements: Html
}).make({
  init: () => 0,
  update: ($) => $.model + 1,
  view: (h, count) => h.button.onClick(CounterMessage.Clicked()).children(`clicked ${count}`)
})

it.effect("pause paints a frozen copy beside the hidden container, and resume shows the live tree again", () =>
  Effect.gen(function*() {
    const app = document.body.appendChild(document.createElement("main"))
    app.className = "app"
    app.style.display = "grid"
    yield* Effect.addFinalizer(() => Effect.sync(() => app.remove()))
    const roots: Array<BrowserHost.Pausable> = []
    const root = yield* BrowserHost.mountEffect(Counter, {}, app).pipe(
      Effect.provideService(BrowserHost.Pausables, {
        register: (root) => {
          roots.push(root)
          return () => roots.splice(roots.indexOf(root), 1)
        }
      })
    )
    expect(roots.map((root) => root.path)).toEqual(["/Counter"])
    const [pausable] = roots

    const fellBack = yield* pausable.pause((path) => path === "/Counter" ? { model: 7 } : undefined)
    expect(fellBack).toEqual([])
    const copy = app.nextElementSibling as HTMLElement
    expect(copy.outerHTML).toBe(
      "<main class=\"app\" style=\"display: grid;\" inert=\"\"><button>clicked 7</button></main>"
    )
    expect(app.style.getPropertyValue("display")).toBe("none")

    root.send(CounterMessage.Clicked())
    copy.querySelector("button")!.click()
    yield* tick
    expect(app.textContent).toBe("clicked 1")
    expect(copy.textContent).toBe("clicked 7")

    yield* pausable.pause(() => undefined)
    expect(document.querySelectorAll("[inert]").length).toBe(1)
    expect(app.nextElementSibling!.outerHTML).toBe(
      "<main class=\"app\" style=\"display: grid;\" inert=\"\"><button>clicked 0</button></main>"
    )

    yield* pausable.resume
    expect(document.querySelectorAll("[inert]").length).toBe(0)
    expect(app.style.getPropertyValue("display")).toBe("grid")
    expect(app.textContent).toBe("clicked 1")
  }).pipe(Effect.scoped))
