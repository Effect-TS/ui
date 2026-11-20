import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  InvalidCredentials,
  LoginEvents,
  LoginMessage,
  LoginPage,
  LoginValidation,
  SimulateAuthRequest,
  validateLogin
} from "./LoginPage.ts"

const alice = { userId: "1", email: "alice@example.com", name: "alice" }

const validModel = {
  form: LoginValidation.change(
    LoginValidation.change(LoginValidation.init({ email: "", password: "" }), "email", alice.email),
    "password",
    "password"
  ),
  submitting: false
}

const fieldsOf = (s: { readonly model: typeof validModel }) => validateLogin(s.model.form).fields

describe("LoginPage", () => {
  it.effect("typing an email validates the field", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(LoginPage, {})
      s.send(LoginMessage.ChangedEmail({ value: "" }))
      assert.strictEqual(fieldsOf(s).email._tag, "Invalid")
      s.send(LoginMessage.ChangedEmail({ value: alice.email }))
      assert.strictEqual(fieldsOf(s).email._tag, "Valid")
      assert.strictEqual(fieldsOf(s).email.value, alice.email)
    }))

  it.effect("typing a password validates the field", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(LoginPage, {})
      s.send(LoginMessage.ChangedPassword({ value: "" }))
      assert.strictEqual(fieldsOf(s).password._tag, "Invalid")
      s.send(LoginMessage.ChangedPassword({ value: "secret" }))
      assert.strictEqual(fieldsOf(s).password._tag, "Valid")
    }))

  it.effect("submitting with invalid fields sends nothing and shows what's missing", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(LoginPage, {})
      s.send(LoginMessage.SubmittedForm()).expectNone()
      assert.isFalse(s.model.submitting)
      const { email, password } = fieldsOf(s)
      assert.deepStrictEqual(
        [email, password].map((field) => field._tag === "Invalid" ? field.errors : []),
        [["Email is required"], ["Password is required"]]
      )
    }))

  it.effect("submitting with valid fields sends an auth request", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(LoginPage, {})
      s.given(validModel).send(LoginMessage.SubmittedForm())
      assert.isTrue(s.model.submitting)
      s.expectExact(SimulateAuthRequest)
      assert.deepStrictEqual(s.pending[0].command.args, { email: alice.email, password: "password" })
      s.resolve(SimulateAuthRequest, alice)
        .emitted(LoginEvents.SignedIn({ session: alice }))
    }))

  it.effect("failed auth marks the password invalid and stops submitting", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(LoginPage, {})
      s.given(validModel)
        .send(LoginMessage.SubmittedForm())
        .fail(SimulateAuthRequest, new InvalidCredentials({ message: "Invalid credentials" }))
      assert.isFalse(s.model.submitting)
      assert.deepStrictEqual(fieldsOf(s).password, {
        _tag: "Invalid",
        value: "password",
        required: true,
        errors: ["Invalid credentials"]
      })
      // The end check fails on an event nothing acknowledged, so none was emitted.
    }))
})
