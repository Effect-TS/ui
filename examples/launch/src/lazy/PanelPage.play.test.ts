import { Component } from "@effect/ui"
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { it } from "@effect/vitest"
import { Deferred, Effect, Layer } from "effect"
import { CounterPanel } from "./CounterPanel.ts"
import { Panel } from "./Panel.ts"
import { PanelLoaderNoDeps } from "./PanelLoader.ts"
import { PanelPage } from "./PanelPage.ts"

const status = HtmlLocator.role("status")
const increment = HtmlLocator.role("button", { name: "Increment" })

it.layer(TestHost.layer())("Effect UI panel loaded on demand", (it) => {
  it.effect("shows the fallback until the panel's Layer is built, then mounts the panel", () =>
    Effect.gen(function*() {
      const loaded = yield* Deferred.make<void>()
      const PanelGated = Layer.unwrap(Deferred.await(loaded).pipe(Effect.as(Panel.toLayer(CounterPanel))))
      const play = yield* HtmlPlay.make(PanelLoaderNoDeps.pipe(Component.provide(PanelGated)), {})
      yield* play.expect(status).toHaveText("Loading the panel")
      yield* Deferred.succeed(loaded, undefined)
      yield* play.click(increment)
      yield* play.expect(status).toHaveText("1")
    }))

  it.effect("imports the panel when the page shows it", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(PanelPage, {})
      yield* play.expect(increment).toBeAbsent()
      yield* play.click(HtmlLocator.role("button", { name: "Show panel" }))
      yield* Effect.promise(() => import("./CounterPanel.ts"))
      yield* play.click(increment)
      yield* play.expect(status).toHaveText("1")
    }))
})
