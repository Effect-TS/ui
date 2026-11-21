import type { Session } from "#domain/Session"
import { Router } from "@effect/ui"
import { HtmlLocator } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { KeyValueStore } from "effect/persistence"
import { TestClock } from "effect/testing"
import { App, appProps } from "./App.ts"
import { SessionStore } from "./auth/services/SessionStore.ts"
import { AppRoute } from "./routes.ts"

const alice: Session = { userId: "1", email: "alice@example.com", name: "alice" }

const AppTest = (url: string) =>
  Layer.mergeAll(
    Router.memory({ routes: AppRoute, url }),
    SessionStore.layer.pipe(Layer.provide(KeyValueStore.layerMemory)),
    TestHost.layer()
  )

const storedSession = SessionStore.use((store) => store.get)

const storeSession = (session: Session) => SessionStore.use((store) => store.set(session))

const currentUrl = Effect.map(Router.Router, (router) => router.location().url)

it.layer(AppTest("/login"), { buildPerTest: true })("App at /login", (it) => {
  it.effect("a successful login saves the session and lands on the dashboard", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(App, appProps)
      yield* TestHost.settle
      Locator.fire(root.get(HtmlLocator.label("Email")), "input", { value: alice.email })
      Locator.fire(root.get(HtmlLocator.label("Password")), "input", { value: "password" })
      yield* TestHost.settle
      Locator.fire(root.get(HtmlLocator.role("form", { name: "Sign in" })), "submit")
      yield* TestHost.settle
      yield* TestClock.adjust("1 second")
      yield* TestHost.settle
      assert.deepStrictEqual(yield* storedSession, Option.some(alice))
      assert.strictEqual(yield* currentUrl, "/dashboard")
      assert.isDefined(root.query(Locator.text("Welcome back, alice!")))
    }))

  it.effect("a stored session redirects from /login to the dashboard", () =>
    Effect.gen(function*() {
      yield* storeSession(alice)
      const root = yield* TestHost.mount(App, appProps)
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/dashboard")
      assert.isDefined(root.query(Locator.text("Welcome back, alice!")))
    }))
})

it.layer(AppTest("/dashboard"), { buildPerTest: true })("App at /dashboard", (it) => {
  it.effect("no session redirects to the login page", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(App, appProps)
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/login")
      assert.isDefined(root.query(HtmlLocator.role("heading", { name: "Sign In" })))
    }))
})

it.layer(AppTest("/settings"), { buildPerTest: true })("App at /settings", (it) => {
  it.effect("signing out clears the session and lands on the home page", () =>
    Effect.gen(function*() {
      yield* storeSession(alice)
      const root = yield* TestHost.mount(App, appProps)
      yield* TestHost.settle
      Locator.fire(root.get(HtmlLocator.role("button", { name: "Sign Out" })), "click")
      yield* TestHost.settle
      assert.deepStrictEqual(yield* storedSession, Option.none())
      assert.strictEqual(yield* currentUrl, "/")
      assert.isDefined(root.query(HtmlLocator.role("heading", { name: "Welcome to Auth Example" })))
    }))
})

it.layer(AppTest("/"), { buildPerTest: true })("App at /", (it) => {
  it.effect("a signed-out navigation to /settings redirects to the login page", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(App, appProps)
      yield* TestHost.settle
      const router = yield* Router.Router
      yield* router.navigate("/settings")
      yield* TestHost.settle
      assert.strictEqual(yield* currentUrl, "/login")
      assert.isDefined(root.query(HtmlLocator.role("heading", { name: "Sign In" })))
    }))
})
