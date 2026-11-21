// @vitest-environment happy-dom
import { Component } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Schema, type Scope } from "effect"
import { Menu } from "./fixtures/headless.ts"
import { Settings } from "./fixtures/settings.ts"

const Checkout = Component.define({
  name: "Checkout",
  model: Schema.Struct({ log: Schema.Array(Schema.String), zip: Schema.String }),
  message: Schema.String,
  elements: Html
}).make({
  init: () => ({ log: [], zip: "old" }),
  update: (model, message) => ({ log: [...model.log, message], zip: message === "fill" ? "new" : model.zip }),
  view: (model, h) =>
    h.div(
      h.form.onFocus("form focus").onSubmit(({ entries }) =>
        `submit:${entries.map(([name, value]) => `${name}=${value}`).join("&")}`
      )
        .children(
          h.input.attr("name", "zip").attr("aria-label", "Zip").value(model.zip).onInput(() => undefined),
          h.input.attr("name", "note").attr("aria-label", "Note").onInput(({ value }) => `note:${value}`),
          h.input.attr("type", "radio").attr("name", "size").attr("value", "s").attr("aria-label", "S").attr(
            "checked",
            ""
          ),
          h.input.attr("type", "radio").attr("name", "size").attr("value", "m").attr("aria-label", "M")
            .onChange(({ value }) => `size:${value}`),
          h.button.onClick("fill").children("Fill"),
          h.button.onClick("stopped", { preventDefault: true }).children("Stop")
        ),
      h.output(model.log.join("|"))
    )
})

const log = Locator.tag("output")

const frame = () => new Promise<void>((resolve) => setTimeout(resolve, 30))

const inBrowser = Effect.fnUntraced(function*(
  component: Component.Any,
  act: (app: HTMLElement) => void | Promise<void>
) {
  const app = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  yield* BrowserHost.mountEffect(component as typeof Settings, {}, app)
  yield* Effect.promise(async () => act(app))
  yield* Effect.promise(frame)
  return app.querySelector("output")!.textContent
}, Effect.scoped)

const play = <A, E>(test: Effect.Effect<A, E, TestHost.TestHost | Scope.Scope>) =>
  test.pipe(Effect.scoped, Effect.provide(TestHost.layer()))

describe("HtmlPlay", () => {
  it.effect("type, keydown and a click's defaults send what BrowserHost sends", () =>
    Effect.gen(function*() {
      const browser = yield* inBrowser(Settings, (app) => {
        const zip = HtmlLocator.getByRole(app, "textbox", { name: "Zip code" }) as HTMLInputElement
        HtmlLocator.type(zip, "10001")
        zip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }))
        HtmlLocator.click(HtmlLocator.getByRole(app, "checkbox", { name: "Agree" }))
        HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Go" }))
      })
      yield* play(Effect.gen(function*() {
        const settings = yield* HtmlPlay.make(Settings, {})
        yield* settings.type(HtmlLocator.label("Zip code"), "10001")
        yield* settings.keydown(HtmlLocator.label("Zip code"), "Enter", { shift: true })
        yield* settings.click(HtmlLocator.role("checkbox", { name: "Agree" }))
        yield* settings.expect(HtmlLocator.label("Agree")).toBeChecked()
        yield* settings.click(HtmlLocator.role("button", { name: "Go" }))
        yield* settings.expect(log).toHaveText(browser!)
        yield* settings.click("Menu")
        yield* settings.click("Menu")
        yield* settings.expect(log).toHaveText(`${browser}|toggle:open|toggle:closed`)
      }))
      assert.strictEqual(browser, "zip:10001|key:Enter+shift|agree:true|submit:zip=10001&agree=on&via=go")
    }))

  it.effect("a submit reads the fields as they were before the click's own message, and keeps what was entered", () =>
    Effect.gen(function*() {
      const browser = yield* inBrowser(Checkout, async (app) => {
        const zip = HtmlLocator.getByRole(app, "textbox", { name: "Zip" }) as HTMLInputElement
        HtmlLocator.type(zip, "rejected")
        const note = HtmlLocator.getByRole(app, "textbox", { name: "Note" }) as HTMLInputElement
        note.focus()
        await frame()
        assert.strictEqual(zip.value, "old")
        HtmlLocator.type(note, "hi")
        HtmlLocator.click(HtmlLocator.getByRole(app, "radio", { name: "M" }))
        HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Stop" }))
        HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Fill" }))
      })
      yield* play(Effect.gen(function*() {
        const checkout = yield* HtmlPlay.make(Checkout, {})
        yield* checkout.type(HtmlLocator.label("Zip"), "rejected")
        yield* checkout.expectIgnored()
        yield* checkout.expect(HtmlLocator.label("Zip")).toHaveValue("old")
        const focus = yield* Effect.exit(checkout.focus(HtmlLocator.label("Note")))
        assert.match(Exit.isFailure(focus) ? Cause.pretty(focus.cause) : "", /nothing handles "focus"/)
        yield* checkout.type(HtmlLocator.label("Note"), "hi")
        yield* checkout.click(HtmlLocator.role("radio", { name: "M" }))
        yield* checkout.click("Stop")
        yield* checkout.click("Fill")
        yield* checkout.expect(log).toHaveText(browser!)
      }))
      assert.strictEqual(browser, "note:hi|size:m|stopped|fill|submit:zip=old&note=hi&size=m")
    }))

  it.effect("a part's message counts as handled, and a key no part takes is ignored", () =>
    Effect.gen(function*() {
      const Toolbar = Component.define({ name: "Toolbar", model: Schema.Null, message: Schema.Never, elements: Html })
        .make({
          init: () => null,
          update: (model) => model,
          view: (_, h) =>
            Menu(h, {
              props: { items: [] },
              view: (menu) => h.div(menu.trigger(h.button).children("Actions"), h.p(menu.open ? "open" : "closed"))
            })
        })
      const toolbar = yield* HtmlPlay.make(Toolbar, {})
      yield* toolbar.keydown(Locator.text("Actions"), "Shift")
      yield* toolbar.expectIgnored()
      yield* toolbar.click("Actions")
      yield* toolbar.expect(Locator.tag("p")).toHaveText("open")
      const exit = yield* Effect.exit(toolbar.expectIgnored())
      assert.match(Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "", /produced a message/)
    }).pipe(play))
})
