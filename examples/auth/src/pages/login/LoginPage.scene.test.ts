import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { InvalidCredentials, LoginPage, LoginValidation, SimulateAuthRequest } from "./LoginPage.ts"

const validModel = {
  form: LoginValidation.change(
    LoginValidation.change(LoginValidation.init({ email: "", password: "" }), "email", "alice@example.com"),
    "password",
    "password"
  ),
  submitting: false
}

const heading = HtmlLocator.role("heading", { name: "Sign In" })
const form = HtmlLocator.role("form", { name: "Sign in" })
const emailField = HtmlLocator.label("Email")
const passwordField = HtmlLocator.label("Password")
const submitButton = HtmlLocator.role("button", { name: "Sign In" })
const submittingButton = HtmlLocator.role("button", { name: "Signing in..." })
const invalidCredentials = new InvalidCredentials({ message: "Invalid credentials" })

describe("LoginPage", () => {
  it.effect("renders the heading, both fields, and the submit button", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.expect(heading).toExist()
        .expect(emailField).toExist()
        .expect(passwordField).toExist()
        .expect(submitButton).toExist()
    }))

  it.effect("submit button starts disabled", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.expect(submitButton).toBeDisabled()
    }))

  it.effect("typing a valid email shows the checkmark", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.type(emailField, "alice@example.com")
        .expect(Locator.text("✓")).toExist()
    }))

  it.effect("typing an invalid email shows the error message", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.type(emailField, "notanemail")
        .expect(Locator.text("Please enter a valid email")).toExist()
        .expect(emailField).toHaveAccessibleName("Email")
    }))

  it.effect("submit button is enabled after typing a valid email and password", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.type(emailField, "alice@example.com")
        .type(passwordField, "password")
        .expect(submitButton).toBeDisabled(false)
    }))

  it.effect("submitting with valid fields shows the loading state and requests auth", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.given(validModel)
        .submit(form)
        .expect(submittingButton).toBeDisabled()
        .expectExact(SimulateAuthRequest)
        .fail(SimulateAuthRequest, invalidCredentials)
    }))

  it.effect("failed auth shows the error and leaves submit disabled until the password changes", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.given(validModel)
        .submit(form)
        .expectExact(SimulateAuthRequest)
        .fail(SimulateAuthRequest, invalidCredentials)
        .expect(Locator.inside(form, Locator.text("Invalid credentials"))).toExist()
        .expect(submitButton).toBeDisabled()
        .type(passwordField, "correcthorse")
        .expect(submitButton).toBeDisabled(false)
    }))
})
