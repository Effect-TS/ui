import { Component, View } from "@effect/ui"
import { Form } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Locator, Scene, Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

const standIn = {
  elements: Html,
  view: (form: Component.Headless.Parts<typeof Form>, h: View.Helper<never, {}> & View.Tags<Html.Elements, never>) =>
    form.root(h.form).children(h.input.attr("name", "email"), h.button.attr("type", "submit").children("Sign up"))
}

const root = Locator.tag("form")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

describe("Form", () => {
  it.effect("a submit reports the form's fields and entries, and a rejected submit reports nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Form, {}, standIn)
      const settle = () => {
        for (const { command } of s.current.pending) s.resolve(command, Component.noop as never)
      }
      const submission = { fields: { email: "ada@example.com" }, entries: [["email", "ada@example.com"]] as const }

      s.fire(root, "submit", submission).emitted({ _tag: "Submitted", ...submission })
      settle()
      s.receive({ _tag: "RejectedSubmit" } as never)
      assert.deepStrictEqual(s.current.emitted, [])
      settle()
    }))

  it("the root is a form with the browser's checks off, whatever the consumer set, and takes no other tag", () => {
    const form = Story.parts(Form, { model: {}, props: {} })
    assert.deepStrictEqual(
      View.build(form.root(h.form.class("signup").attr("novalidate", "stale")), []).attrs,
      { class: "signup", novalidate: "" }
    )
    assert.throws(() => form.root(h.div as any), /a part for <form> was given <div>/)
  })
})
