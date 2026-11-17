// @vitest-environment happy-dom
import { Component } from "@effect/ui"
import { Switch } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

// Consumer attributes that collide with the switch's own in another case,
// and malformed names, which the server would otherwise write as markup.
const attributes = {
  label: { FOR: "elsewhere" },
  root: {
    Class: "track",
    TYPE: "submit",
    Role: "checkbox",
    "ARIA-CHECKED": "mixed",
    "Aria-Readonly": "true",
    Disabled: "",
    "x onclick": "alert(1)",
    "a\"><b": "x"
  },
  thumb: { "Data-Scope": "slider" }
}

const Message = Schema.TaggedUnion({ Toggled: { checked: Schema.Boolean } })
const Page = Component.define({
  name: "Page",
  model: Schema.Boolean,
  message: Message,
  elements: Html
}).make({
  init: () => false,
  update: (_, message) => message.checked,
  view: (checked, h) =>
    h.form(
      Switch(h, {
        key: "s",
        props: { checked, name: "notify", attributes },
        onEmit: (event) => Message.make({ _tag: "Toggled", checked: event.checked }),
        slots: { label: "Notify" }
      })
    )
})

// What the switch must draw, whatever the consumer passed.
const assertOwned = (container: ParentNode) => {
  const label = container.querySelector("label")!
  const root = container.querySelector("button")!
  assert.isFalse(label.hasAttribute("for"))
  assert.strictEqual(root.getAttribute("class"), "track")
  assert.strictEqual(root.getAttribute("type"), "button")
  assert.strictEqual(root.getAttribute("role"), "switch")
  assert.strictEqual(root.getAttribute("aria-checked"), "false")
  assert.isFalse(root.hasAttribute("aria-readonly"))
  assert.isFalse(root.hasAttribute("disabled"))
  assert.isFalse(root.hasAttribute("onclick"))
  assert.strictEqual(container.querySelector("[data-part=thumb]")!.getAttribute("data-scope"), "switch")
  assert.isNull(container.querySelector("b"))
}

describe("Switch in the browser", () => {
  it.effect("server HTML and the hydrated switch keep the switch's own attributes, and a click toggles it", () =>
    Effect.gen(function*() {
      const result = yield* ssr(Page, {})
      // Each name once, in lowercase, so a parser can't keep the consumer's.
      const root = /<button[^>]*>/.exec(result.html)![0]
      assert.strictEqual(
        root,
        `<button class="track" data-scope="switch" data-part="root" data-unchecked type="button" role="switch" aria-checked="false">`
      )
      assert.notInclude(result.html, "onclick")
      assertOwned(result.container)
      result.container.querySelector("button")!.click()
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("button")!.getAttribute("aria-checked"), "true")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("a switch mounted on the client keeps its own attributes", () =>
    Effect.gen(function*() {
      const app = yield* Effect.acquireRelease(
        Effect.sync(() => document.body.appendChild(document.createElement("div"))),
        (element) => Effect.sync(() => element.remove())
      )
      yield* BrowserHost.mountEffect(Page, {}, app)
      yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))
      assertOwned(app)
    }).pipe(Effect.scoped))
})
