// @vitest-environment happy-dom
import { Command, Component, UiSchema, Validation } from "@effect/ui"
import { Field, Form } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { container, focusability, tick } from "./utils/document.ts"

const SignupValidation = Validation.make({
  plan: { required: "Pick a plan" },
  email: { required: "Enter your email", rules: [Validation.Rule.email("Enter a valid email")] },
  name: { required: "Enter your name" }
})

const FieldName = Schema.Literals(["plan", "email", "name"])

const Message = UiSchema.TaggedEnum({
  UpdatedField: { name: FieldName, value: Schema.String },
  SubmittedForm: {},
  SucceededSave: {},
  FailedSave: {}
})

const Save = Command.make(
  "Save",
  { args: { email: Schema.String } },
  ({ email }) =>
    Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5))).pipe(
      Effect.as(email.startsWith("taken") ? Message.FailedSave() : Message.SucceededSave())
    )
)

const SignupForm = Form.ref("Signup")

const Signup = Component.define({
  name: "Signup",
  model: Schema.Struct({ form: SignupValidation.State, saving: Schema.Boolean }),
  message: Message,
  elements: Html
}).make({
  init: () => ({ form: SignupValidation.init({ plan: "", email: "", name: "" }), saving: false }),
  update: {
    UpdatedField: (model, { name, value }) => ({ ...model, form: SignupValidation.change(model.form, name, value) }),
    SubmittedForm: (model, _message, $) => {
      const form = SignupValidation.submit(model.form)
      return Option.match(SignupValidation.validate(form).value, {
        onNone: () => ({ ...model, form }),
        onSome: ({ email }) => $.set({ form, saving: true }).run(Save.make({ email }))
      })
    },
    SucceededSave: (model) => ({ ...model, saving: false }),
    FailedSave: (model, _message, $) =>
      $.set({ saving: false, form: SignupValidation.reject(model.form, { email: ["That email is taken"] }) })
        .send(SignupForm, { _tag: "RejectedSubmit" })
  },
  view: (model, h) => {
    const { fields } = SignupValidation.validate(model.form)
    const text = (name: "email" | "name") =>
      Field(h, {
        key: name,
        props: { invalid: fields[name]._tag === "Invalid" },
        view: (field) =>
          field.root(h.div).children(
            field.control(h.input).attr("name", name).attr("aria-label", name).value(fields[name].value)
              .disabled(model.saving)
              .onInput(({ value }) => Message.UpdatedField({ name, value })),
            field.error(h.span)?.children("Invalid")
          )
      })
    const radio = (value: string, tabbable: boolean) =>
      h.button.attr("type", "button").attr("role", "radio").attr("tabindex", tabbable ? "0" : "-1")
        .attr("data-plan", value)
        .onClick(Message.UpdatedField({ name: "plan", value }))
    return Form(h, {
      ref: SignupForm,
      onEmit: () => Message.SubmittedForm(),
      view: (form) =>
        form.root(h.form).children(
          h.div.attr("role", "radiogroup").attr("aria-invalid", fields.plan._tag === "Invalid" ? "true" : undefined)
            .children(radio("free", false), radio("team", true)),
          text("email"),
          text("name"),
          h.button.attr("type", "submit").children("Sign up")
        )
    })
  }
})

const type = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

const mountSignup = Effect.gen(function*() {
  const app = yield* container
  yield* BrowserHost.mountEffect(Signup, {}, app)
  yield* tick
  const submit = app.querySelector<HTMLButtonElement>("button[type=submit]")!
  return {
    submit,
    email: app.querySelector<HTMLInputElement>("input[name=email]")!,
    name: app.querySelector<HTMLInputElement>("input[name=name]")!,
    team: app.querySelector<HTMLButtonElement>("[data-plan=team]")!,
    submitForm: Effect.sync(() => {
      submit.focus()
      submit.click()
    }).pipe(Effect.andThen(tick))
  }
})

describe("Form in a document", { concurrent: false }, () => {
  it.effect("a failed submit focuses the first invalid control: a group's tabbable member, then an input with its text selected", () =>
    Effect.gen(function*() {
      yield* focusability
      const { email, submitForm, team } = yield* mountSignup

      type(email, "nope")
      yield* submitForm
      assert.strictEqual(document.activeElement, team)

      team.click()
      yield* submitForm
      assert.strictEqual(document.activeElement, email)
      assert.deepStrictEqual([email.selectionStart, email.selectionEnd], [0, 4])
    }).pipe(Effect.scoped))

  it.effect("an error that arrives after the submit focuses its control, and a valid submit leaves focus alone", () =>
    Effect.gen(function*() {
      const { email, name, submit, submitForm, team } = yield* mountSignup

      team.click()
      type(name, "Ada")
      type(email, "taken@example.com")
      yield* submitForm
      assert.strictEqual(document.activeElement, email)

      type(email, "ada@example.com")
      yield* submitForm
      assert.strictEqual(document.activeElement, submit)
    }).pipe(Effect.scoped))
})
