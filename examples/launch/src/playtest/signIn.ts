import { Router } from "@effect/ui"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { App, appProps } from "auth/src/App.ts"
import { SessionStore } from "auth/src/auth/services/SessionStore.ts"
import { AppRoute } from "auth/src/routes.ts"
import { Effect, Equal, Layer, Option } from "effect"
import { KeyValueStore } from "effect/persistence"
import { TestClock } from "effect/testing"
import { formatMs, type Frame, record, type Step } from "./trace.ts"

// The values and helpers of examples/auth/src/App.play.test.ts.
const alice = {
  userId: "1",
  email: "alice@example.com",
  name: "alice"
}

const storedSession = SessionStore.use((store) => store.get)

const currentUrl = Effect.map(
  Router.Router,
  (router) => router.location().url
)

const email = HtmlLocator.label("Email")
const password = HtmlLocator.label("Password")
const signIn = HtmlLocator.role("button", { name: "Sign In" })
const welcome = Locator.text("Welcome back, alice!")

const mount = HtmlPlay.make(App, appProps)

type Play = Effect.Success<typeof mount>

type Services = Router.Router | SessionStore

const failUnless = (holds: boolean) =>
  holds ? Effect.void : Effect.fail("The check failed")

/**
 * The lines after `HtmlPlay.make` in "a successful login saves the
 * session and lands on the dashboard", each run as the test runs it.
 */
const steps: ReadonlyArray<Step<Play, Services>> = [
  {
    source:
      "yield* play.type(HtmlLocator.label(\"Email\"), alice.email)",
    target: ["email", email],
    run: (play) => play.type(email, alice.email)
  },
  {
    source:
      "yield* play.type(HtmlLocator.label(\"Password\"), \"password\")",
    target: ["password", password],
    run: (play) => play.type(password, "password")
  },
  {
    source:
      "yield* play.click(HtmlLocator.role(\"button\", { name: \"Sign In\" }))",
    target: ["signIn", signIn],
    run: (play) => play.click(signIn)
  },
  {
    source: "yield* TestClock.adjust(\"1 second\")",
    run: () => TestClock.adjust("1 second")
  },
  {
    source:
      "yield* play.expect(Locator.text(\"Welcome back, alice!\")).toExist()",
    target: ["welcome", welcome],
    checks: true,
    run: (play) => play.expect(welcome).toExist()
  },
  {
    source:
      "assert.deepStrictEqual(yield* storedSession, Option.some(alice))",
    checks: true,
    run: () =>
      Effect.flatMap(
        storedSession,
        (session) =>
          failUnless(Equal.equals(session, Option.some(alice)))
      )
  },
  {
    source: "assert.strictEqual(yield* currentUrl, \"/dashboard\")",
    checks: true,
    run: () =>
      Effect.flatMap(
        currentUrl,
        (url) => failUnless(url === "/dashboard")
      )
  }
]

/** Every line the test runs, in order. */
export const sources: ReadonlyArray<string> = [
  "const play = yield* HtmlPlay.make(App, appProps)",
  ...steps.map((step) => step.source)
]

/** What each line of the test does, one per entry of `sources`. */
export const notes: ReadonlyArray<string> = [
  "The test mounts the whole app at /login. Its router and session store keep their data in memory.",
  "The test types an email into the Email field.",
  "The test types a password. Both fields are filled in, so the form enables its button.",
  "The test clicks Sign In. The real sign-in Command starts a request that takes one second.",
  "The test moves the clock one second. The app saves the session and shows the dashboard.",
  "The test checks that the dashboard is showing.",
  "The test checks that the session is in the store.",
  "The test checks that the URL is /dashboard. This test covers the form, the request, storage and routing."
]

/** Runs the test on a fresh TestHost, TestClock, router and store. */
export const run: Effect.Effect<ReadonlyArray<Frame>> = record({
  mount,
  steps,
  facts: Effect.fnUntraced(function*({ clock }) {
    const session = yield* Effect.orElseSucceed(
      storedSession,
      () => Option.none()
    )
    return [
      { part: "clock", label: "TestClock", value: formatMs(clock) },
      { part: "url", label: "URL", value: yield* currentUrl },
      {
        part: "session",
        label: "Stored session",
        value: Option.match(session, {
          onNone: () => "None",
          onSome: (stored) => stored.name
        })
      }
    ]
  })
}).pipe(
  Effect.scoped,
  Effect.provide(
    Layer.mergeAll(
      Router.memory({ routes: AppRoute, url: "/login" }),
      SessionStore.layer.pipe(
        Layer.provide(KeyValueStore.layerMemory)
      ),
      TestHost.layer({ flush: "queued" }),
      TestClock.layer()
    )
  ),
  Effect.orElseSucceed(() => []),
  Effect.catchDefect(() => Effect.succeed([]))
)
