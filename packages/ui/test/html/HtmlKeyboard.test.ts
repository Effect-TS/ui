import { Component } from "@effect/ui"
import { Html, HtmlKeyboard, HtmlSubscription } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

describe("HtmlKeyboard.shortcuts", () => {
  const key = (
    overrides: Partial<HtmlSubscription.GlobalPayload<Html.KeyPayload>>
  ): HtmlSubscription.GlobalPayload<Html.KeyPayload> => ({
    key: "",
    shift: false,
    ctrl: false,
    alt: false,
    meta: false,
    composing: false,
    repeat: false,
    editable: false,
    selectionStart: null,
    selectionEnd: null,
    defaultPrevented: false,
    ...overrides
  })

  it("matches rows in order with modifier, typing, repeat, composing and defaultPrevented guards", () => {
    const handle = HtmlKeyboard.shortcuts([
      { key: "?", message: "help" },
      { key: "Escape", message: "close", whileTyping: true },
      { key: "ArrowDown", message: "down", repeat: true },
      { key: "k", meta: true, shift: true, message: "cmd-shift-k" },
      { key: "k", meta: true, message: "cmd-k" },
      { key: "o", mod: true, message: "open" }
    ])
    assert.strictEqual(handle(key({ key: "?", shift: true })), "help")
    assert.strictEqual(handle(key({ key: "?", ctrl: true })), undefined)
    assert.strictEqual(handle(key({ key: "?", editable: true })), undefined)
    assert.strictEqual(handle(key({ key: "?", repeat: true })), undefined)
    assert.strictEqual(handle(key({ key: "?", composing: true })), undefined)
    assert.strictEqual(
      handle(key({ key: "?", defaultPrevented: true })),
      undefined
    )
    assert.strictEqual(handle(key({ key: "Escape", editable: true })), "close")
    assert.strictEqual(handle(key({ key: "ArrowDown", repeat: true })), "down")
    assert.strictEqual(
      handle(key({ key: "k", meta: true, shift: true })),
      "cmd-shift-k"
    )
    assert.strictEqual(handle(key({ key: "k", meta: true })), "cmd-k")
    assert.strictEqual(handle(key({ key: "o", ctrl: true })), "open")
    assert.strictEqual(handle(key({ key: "o", meta: true })), "open")
    assert.strictEqual(
      handle(key({ key: "o", ctrl: true, meta: true })),
      undefined
    )
    assert.strictEqual(
      handle(key({ key: "o", ctrl: true, alt: true })),
      undefined
    )
    assert.strictEqual(handle(key({ key: "o" })), undefined)
    assert.strictEqual(handle(key({ key: "x" })), undefined)
  })

  it.effect("works with both element onKeyDown and HtmlSubscription.onDocument", () =>
    Effect.gen(function*() {
      const Panel = Component.define({
        name: "Panel",
        model: Schema.Array(Schema.String),
        message: Schema.String,
        elements: Html
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, entry) => [...$.model, entry],
        view: (h, log) =>
          h.div(
            h.button.onKeyDown(
              HtmlKeyboard.shortcuts([{ key: "j", message: "el:j" }]),
              { preventDefault: true }
            )
              .children("Row"),
            h.output(log.join(","))
          ),
        subscriptions: () => [
          HtmlSubscription.onDocument(
            "keydown",
            HtmlKeyboard.shortcuts([
              { key: "?", message: "doc:help" },
              { key: "Escape", message: "doc:close", whileTyping: true }
            ]),
            { preventDefault: true }
          )
        ]
      })
      const scene = yield* HtmlScene.make(Panel, {})
      scene.keydown(Locator.text("Row"), "j").expectDefaultPrevented()
        .keydown(Locator.text("Row"), "x").expectIgnored()
        .expectDefaultPrevented(false)
        .fireDocument("keydown", { key: "?", editable: true }).expectIgnored()
        .fireDocument("keydown", { key: "?", shift: true })
        .expectDefaultPrevented()
        .fireDocument("keydown", { key: "Escape", editable: true })
        .expectDefaultPrevented()
        .expect(Locator.tag("output")).toHaveText("el:j,doc:help,doc:close")
    }))
})
