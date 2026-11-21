import { Command, Component, UiSchema, Validation, type View } from "@effect/ui"
import { Button, Field, Input } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Duration, Effect, Option, Schema } from "effect"
import { Session } from "../../auth/domain/Session.ts"
import { AppRoute, homeRoute } from "../../routes.ts"

const Rule = Validation.Rule

export const LoginValidation = Validation.make({
  email: { required: "Email is required", rules: [Rule.email("Please enter a valid email")] },
  password: { required: "Password is required" }
}, { mode: "onChange" })

export const LoginMessage = UiSchema.TaggedEnum({
  ChangedEmail: { value: Schema.String },
  ChangedPassword: { value: Schema.String },
  SubmittedForm: {},
  SucceededSimulateAuthRequest: { session: Session },
  FailedSimulateAuthRequest: { error: Schema.String }
})

export const LoginEvents = UiSchema.TaggedEnum({ SignedIn: { session: Session } })

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()("InvalidCredentials", {
  message: Schema.String
}) {}

export class SimulateAuthRequest extends Command.Service<SimulateAuthRequest>()(
  "auth/SimulateAuthRequest",
  { args: { email: Schema.String, password: Schema.String } },
  Effect.gen(function*() {
    return ({ email, password }) =>
      Effect.gen(function*() {
        yield* Effect.sleep(Duration.seconds(1))
        if (password !== "password") {
          return yield* new InvalidCredentials({ message: "Invalid credentials" })
        }
        const [name] = email.split("@")
        return { userId: "1", email, name: name === "" ? email : name } satisfies Session
      })
  })
) {}

const simulateAuthRequest = (email: string, password: string) =>
  SimulateAuthRequest.make({ email, password }).pipe(Command.match({
    onSuccess: (session) => LoginMessage.SucceededSimulateAuthRequest({ session }),
    onFailure: (error) => LoginMessage.FailedSimulateAuthRequest({ error: error.message })
  }))

type LoginField = Validation.Field<string>

const invalidOf = (field: LoginField): boolean | undefined =>
  field._tag === "Invalid" ? true : field._tag === "Valid" ? false : undefined

const FormField = <M>(h: View.H<M>, options: {
  readonly key: string
  readonly label: string
  readonly type: "email" | "password"
  readonly placeholder: string
  readonly field: LoginField
  readonly disabled: boolean
  readonly onUpdate: (value: string) => M
}) => {
  const { field } = options
  return Field(h, {
    key: options.key,
    props: { invalid: invalidOf(field), filled: field.value !== "", disabled: options.disabled },
    view: (f) =>
      f.root(h.div).children(
        h.div.class("flex items-center gap-2 mb-1").children(
          f.label(h.label).class("block text-sm font-medium text-gray-700").children(options.label),
          field._tag === "Valid" && h.span.class("text-green-600 text-sm").children("✓")
        ),
        Input(h, {
          element: f.control(h.input),
          props: { value: field.value },
          onUpdate: ({ value }) => options.onUpdate(value)
        })
          .attr("type", options.type)
          .attr("placeholder", options.placeholder)
          .class(
            "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
            "disabled:bg-gray-100 data-valid:border-green-500 data-invalid:border-red-500"
          ),
        field._tag === "Invalid" &&
          f.error(h.div)?.class("text-red-600 text-sm mt-1").children(field.errors[0])
      )
  })
}

export const LoginPageNoDeps = Component.define({
  name: "LoginPage",
  model: Schema.Struct({ form: LoginValidation.State, submitting: Schema.Boolean }),
  message: LoginMessage,
  events: LoginEvents,
  elements: Html
}).make({
  init: () => ({
    form: LoginValidation.init({ email: "", password: "" }),
    submitting: false
  }),

  update: {
    ChangedEmail: (model, { value }) => ({ ...model, form: LoginValidation.change(model.form, "email", value) }),

    ChangedPassword: (model, { value }) => ({
      ...model,
      form: LoginValidation.change(model.form, "password", value)
    }),

    SubmittedForm: (model, _message, $) => {
      if (model.submitting) return model
      const form = LoginValidation.submit(model.form)
      return Option.match(LoginValidation.validate(form).value, {
        onNone: () => ({ ...model, form }),
        onSome: ({ email, password }) => $.set({ form, submitting: true }).run(simulateAuthRequest(email, password))
      })
    },

    SucceededSimulateAuthRequest: (_model, { session }, $) => $.emit(LoginEvents.SignedIn({ session })),

    FailedSimulateAuthRequest: (model, { error }) => ({
      submitting: false,
      form: LoginValidation.reject(model.form, { password: [error] })
    })
  },

  view: (model, h) => {
    const validated = LoginValidation.validate(model.form)
    const canSubmit = Option.isSome(validated.value) && !model.submitting
    return h.div.class("max-w-md mx-auto px-4").children(
      h.div.class("bg-white rounded-xl shadow-lg p-8").children(
        h.h1.class("text-3xl font-bold text-gray-800 text-center mb-8").children("Sign In"),
        h.div.class("mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg").children(
          h.p.class("text-sm text-blue-700").children("Hint: Use any email with password \"password\"")
        ),
        h.form.attr("aria-label", "Sign in").attr("novalidate", "").class("space-y-6")
          .onSubmit(LoginMessage.SubmittedForm()).children(
            FormField(h, {
              key: "email",
              label: "Email",
              type: "email",
              placeholder: "you@example.com",
              field: validated.fields.email,
              disabled: model.submitting,
              onUpdate: (value) => LoginMessage.ChangedEmail({ value })
            }),
            FormField(h, {
              key: "password",
              label: "Password",
              type: "password",
              placeholder: "Enter your password",
              field: validated.fields.password,
              disabled: model.submitting,
              onUpdate: (value) => LoginMessage.ChangedPassword({ value })
            }),
            Button(h, { props: { type: "submit", disabled: !canSubmit } })
              .class(
                "w-full py-3 font-medium rounded-lg transition bg-blue-500 text-white cursor-pointer",
                "enabled:hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
              )
              .children(model.submitting ? "Signing in..." : "Sign In")
          ),
        h.div.class("mt-6 text-center").children(
          h.span.class("text-gray-600").children("Back to "),
          h.a.attr("href", AppRoute.print(homeRoute)).class("text-blue-500 hover:underline").children("Home")
        )
      )
    )
  }
})

export const LoginPage = LoginPageNoDeps.pipe(Component.provide(SimulateAuthRequest.layer))
