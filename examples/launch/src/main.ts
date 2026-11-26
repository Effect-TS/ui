import { DevTools } from "@effect/ui-devtools"
import { HtmlHydrate } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { snippets } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

const props = {
  snippets,
  articleUrl: new URL("article.md", document.baseURI).href
}
const root = document.getElementById("root")!
const state = JSON.parse(
  document.getElementById("state")!.textContent!
)

// src/entry.server.ts renders the page, in dev and in the prerendered
// build, and HtmlHydrate.hydrate adopts its DOM nodes. DevTools.layer adds
// the corner inspector.
const Main = HtmlHydrate.hydrate(LaunchPage, props, root, state).pipe(
  Layer.provide(DevTools.layer({ position: "BottomRight" }))
)

// Builds the Layer, which starts the app, and keeps it running.
Layer.launch(Main).pipe(Effect.runFork)
