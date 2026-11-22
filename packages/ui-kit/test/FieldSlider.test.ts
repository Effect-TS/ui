// @vitest-environment happy-dom
import { Component } from "@effect/ui"
import { Field, Slider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { container, tick } from "./utils/document.ts"

it.effect("a range slider in a field is named by the legend, described, and focused and touched as a whole", () =>
  Effect.gen(function*() {
    const Price = Component.define({
      name: "Price",
      scoped: false,
      model: Schema.Struct({}),
      message: Schema.Never,
      elements: Html
    })
      .make({
        init: () => ({}),
        update: (model) => model,
        view: (_, h) =>
          h.div(
            Field(h, {
              props: { invalid: true, described: true },
              view: (field) =>
                field.root(h.div.class("field")).children(
                  field.legend(h.div).children("Price"),
                  Slider(h, {
                    props: { value: [20, 80], disabled: field.disabled },
                    view: (slider) =>
                      slider.root(field.group(h.div)).children(
                        slider.control(h.div).children(
                          slider.track(h.div).children(
                            ...["Minimum", "Maximum"].map((name, index) =>
                              slider.thumb({
                                element: h.div,
                                index,
                                input: field.member(h.input).attr("aria-label", name)
                              })
                            )
                          )
                        )
                      )
                  }),
                  field.description(h.p).children("In dollars"),
                  field.error(h.span)?.children("Enter a range")
                )
            }),
            h.button("After")
          )
      })
    const app = yield* container
    yield* BrowserHost.mountEffect(Price, {}, app)
    yield* tick
    const field = app.querySelector(".field")!
    const group = app.querySelector("[role=group]")!
    const [minimum, maximum] = Array.from(app.querySelectorAll("input"))
    const ids = [app.querySelector("p")!.id, app.querySelector("span")!.id].join(" ")
    assert.strictEqual(app.querySelector(`#${group.getAttribute("aria-labelledby")}`)?.textContent, "Price")
    assert.isFalse(group.hasAttribute("aria-invalid"))
    for (const input of [minimum!, maximum!]) {
      assert.isFalse(input.hasAttribute("id"))
      assert.strictEqual(input.getAttribute("aria-describedby"), ids)
      assert.strictEqual(input.getAttribute("aria-invalid"), "true")
    }
    const assertState = (focused: boolean, touched: boolean) => {
      for (const part of [field, group, minimum!, maximum!]) {
        assert.strictEqual(part.hasAttribute("data-focused"), focused)
        assert.strictEqual(part.hasAttribute("data-touched"), touched)
      }
    }
    minimum!.focus()
    yield* tick
    assert.strictEqual(document.activeElement, minimum)
    assertState(true, false)
    maximum!.focus()
    yield* tick
    assert.strictEqual(document.activeElement, maximum)
    assertState(true, false)
    app.querySelector("button")!.focus()
    yield* tick
    assertState(false, true)
  }).pipe(Effect.scoped))
