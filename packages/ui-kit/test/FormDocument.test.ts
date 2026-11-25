// @vitest-environment happy-dom
import { Command, UiSchema, Validation } from "@effect/ui"
import { Field, Form, RadioGroup } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { container, focusability, tick } from "./utils/document.ts"

const SignupValidation = Validation.make({
  plan: { required: "Pick a plan" },
  billing: {
    rules: [Validation.Rule.equals("monthly", "Yearly billing isn't open yet")]
  },
  email: {
    required: "Enter your email",
    rules: [Validation.Rule.email("Enter a valid email")]
  },
  name: { required: "Enter your name" }
})

const FieldName = Schema.Literals(["plan", "billing", "email", "name"])

const Message = UiSchema.TaggedEnum({
  UpdatedField: { name: FieldName, value: Schema.String },
  SubmittedForm: {},
  SucceededSave: {}
})

const Save = Command.make(
  "Save",
  { args: { email: Schema.String } },
  () =>
    Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5)))
      .pipe(
        Effect.as(Message.SucceededSave())
      )
)

const Signup = Html.component({
  name: "Signup",
  model: Schema.Struct({
    form: SignupValidation.State,
    saving: Schema.Boolean
  }),
  message: Message
}).make({
  init: () => ({
    form: SignupValidation.init({
      plan: "",
      billing: "yearly",
      email: "",
      name: ""
    }),
    saving: false
  }),
  update: {
    UpdatedField: ($, { name, value }) => ({
      ...$.model,
      form: SignupValidation.change($.model.form, name, value)
    }),
    SubmittedForm: ($) => {
      const form = SignupValidation.submit($.model.form)
      return Option.match(SignupValidation.validate(form).value, {
        onNone: () => ({ ...$.model, form }),
        onSome: ({ email }) =>
          $.set({ form, saving: true }).run(Save.make({ email }))
      })
    },
    SucceededSave: ($) => ({ ...$.model, saving: false })
  },
  view: (h, model) => {
    const { fields } = SignupValidation.validate(model.form)
    const text = (name: "email" | "name", form?: string) =>
      Field(h, {
        key: name,
        props: { invalid: fields[name]._tag === "Invalid" },
        view: (field) =>
          field.root(h.div).children(
            field.control(h.input).attrs({ name, "aria-label": name, form })
              .value(
                fields[name].value
              )
              .disabled(model.saving)
              .onInput(({ value }) => Message.UpdatedField({ name, value })),
            field.error(h.span)?.children("Invalid")
          )
      })
    const plans = [{ value: "free", disabled: true }, { value: "team" }]
    return h.div(
      Form(h, {
        onEmit: () => Message.SubmittedForm(),
        view: (form) =>
          form.root(h.form.attr("id", "signup")).children(
            RadioGroup(h, {
              props: {
                value: fields.plan.value === "" ? null : fields.plan.value,
                items: plans,
                invalid: fields.plan._tag === "Invalid"
              },
              onEmit: {
                Picked: ({ value }) =>
                  Message.UpdatedField({ name: "plan", value })
              },
              view: (radioGroup) =>
                radioGroup.root(h.div).children(
                  ...plans.map(({ value }) =>
                    radioGroup.radio({
                      element: h.button.attr("data-plan", value),
                      value
                    })
                  )
                )
            }),
            Field(h, {
              key: "billing",
              props: { invalid: fields.billing._tag === "Invalid" },
              view: (field) =>
                field.group(h.div).children(
                  field.legend(h.span).children("Billing"),
                  ...["monthly", "yearly"].map((value) =>
                    field.member(h.input).attrs({
                      type: "radio",
                      name: "billing",
                      value
                    })
                      .checked(fields.billing.value === value)
                      .onClick(Message.UpdatedField({ name: "billing", value }))
                  )
                )
            }),
            text("email"),
            h.button.attr("type", "submit").children("Sign up")
          )
      }),
      // Outside the form, which it names with `form`.
      text("name", "signup")
    )
  }
})

// Radios outside the form, the invalid one first, and controls inside it
// whose names shadow the form's `contains` and `elements`.
const Detached = Html.component({
  name: "Detached",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) => {
    const radio = (value: string, form?: string) =>
      h.input.attrs({
        type: "radio",
        name: "billing",
        value,
        form,
        "aria-invalid": value === "monthly" ? "true" : undefined
      }).checked(value !== "monthly")
    return h.div(
      radio("other"),
      radio("monthly", "detached"),
      radio("yearly", "detached"),
      Form(h, {
        view: (form) =>
          form.root(h.form.attr("id", "detached")).children(
            h.input.attrs({ name: "contains" }),
            h.input.attrs({ name: "elements", "aria-invalid": "true" }),
            h.button.attr("type", "submit")
          )
      })
    )
  }
})

const type = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("Form in a document", { concurrent: false }, () => {
  it.effect("an invalid radio outside the form, first in document order, passes focus to the checked radio of its form", () =>
    Effect.gen(function*() {
      yield* focusability
      const app = yield* container
      yield* BrowserHost.mountEffect(Detached, {}, app)
      yield* tick
      app.querySelector<HTMLButtonElement>("button[type=submit]")!.click()
      yield* tick
      assert.strictEqual(
        document.activeElement,
        app.querySelector("input[value=yearly]")
      )
    }).pipe(Effect.scoped))

  it.effect("focuses the first invalid control on submit, outside the form too, and leaves focus alone when valid or invalidated later", () =>
    Effect.gen(function*() {
      yield* focusability
      const app = yield* container
      yield* BrowserHost.mountEffect(Signup, {}, app)
      yield* tick
      const submit = app.querySelector<HTMLButtonElement>(
        "button[type=submit]"
      )!
      const email = app.querySelector<HTMLInputElement>("input[name=email]")!
      const name = app.querySelector<HTMLInputElement>("input[name=name]")!
      const team = app.querySelector<HTMLButtonElement>("[data-plan=team]")!
      const submitForm = Effect.sync(() => {
        submit.focus()
        submit.click()
      }).pipe(Effect.andThen(tick))

      type(email, "nope")
      yield* submitForm
      assert.strictEqual(document.activeElement, team)

      team.click()
      yield* submitForm
      assert.strictEqual(
        document.activeElement,
        app.querySelector("input[value=yearly]")
      )

      app.querySelector<HTMLInputElement>("input[value=monthly]")!.click()
      yield* submitForm
      assert.strictEqual(document.activeElement, email)
      assert.deepStrictEqual([email.selectionStart, email.selectionEnd], [0, 4])

      type(email, "ada@example.com")
      yield* submitForm
      assert.strictEqual(document.activeElement, name)

      type(name, "Ada")
      yield* submitForm
      assert.strictEqual(document.activeElement, submit)

      type(email, "nope")
      yield* tick
      assert.strictEqual(email.getAttribute("aria-invalid"), "true")
      assert.strictEqual(document.activeElement, submit)
    }).pipe(Effect.scoped))
})
