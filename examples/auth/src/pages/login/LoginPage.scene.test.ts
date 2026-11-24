import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import {
  LoginPage,
  LoginPageEvents,
  LoginPageMessage,
  SimulateAuthRequest
} from "./LoginPage.ts"

const alice = { userId: "1", email: "alice@example.com", name: "alice" }

const form = HtmlLocator.role("form", { name: "Sign in" })
const emailField = HtmlLocator.label("Email")
const passwordField = HtmlLocator.label("Password")
const submitButton = HtmlLocator.role("button", { name: "Sign In" })
const submittingButton = HtmlLocator.role("button", { name: "Signing in..." })

describe("LoginPage", () => {
  it.effect("validates fields on input and invalid submit, enabling submit once valid", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.expect(submitButton).toBeDisabled()
        .type(emailField, "notanemail")
        .expect(Locator.text("Please enter a valid email")).toExist()
        .expect(submitButton).toBeDisabled()
        .type(emailField, "")
        .submit(form)
        .expectNone()
        .expect(Locator.text("Email is required")).toExist()
        .expect(Locator.text("Password is required")).toExist()
        .type(emailField, alice.email)
        .expect(Locator.text("✓")).toExist()
        .type(passwordField, "password")
        .expect(submitButton).toBeDisabled(false)
    }))

  it.effect("submitting locks the form, requests auth, and emits SignedIn on success", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.type(emailField, alice.email)
        .type(passwordField, "password")
        .submit(form)
        .expect(submittingButton).toBeDisabled()
        .expect(emailField).toBeDisabled()
        .expect(passwordField).toBeDisabled()
        .expectExact(
          SimulateAuthRequest.make({
            email: alice.email,
            password: Redacted.make("password")
          })
        )
        .resolve(
          SimulateAuthRequest,
          LoginPageMessage.SucceededSimulateAuthRequest({ session: alice })
        )
        .emitted(LoginPageEvents.SignedIn({ session: alice }))
    }))

  it.effect("failed auth shows the error and leaves submit disabled until the password changes", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(LoginPage, {})
      s.type(emailField, alice.email)
        .type(passwordField, "wrong")
        .submit(form)
        .resolve(
          SimulateAuthRequest,
          LoginPageMessage.FailedSimulateAuthRequest({
            error: "Invalid credentials"
          })
        )
        .expect(Locator.inside(form, Locator.text("Invalid credentials")))
        .toExist()
        .expect(submitButton).toBeDisabled()
        .type(passwordField, "correcthorse")
        .expect(submitButton).toBeDisabled(false)
    }))
})
