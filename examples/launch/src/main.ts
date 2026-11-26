import { DevTools } from "@effect/ui-devtools"
import { BrowserHost, HtmlHydrate } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { snippets } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

const props = {
  snippets,
  articleUrl: new URL("article.md", document.baseURI).href
}
const root = document.getElementById("root")!
const state = document.getElementById("state")?.textContent

// Prerendered builds ship HTML and serialized state from HtmlServer;
// HtmlHydrate.hydrate adopts those DOM nodes, while BrowserHost.mount
// renders fresh in dev. DevTools.layer adds the corner inspector.
const Main = (
  state
    ? HtmlHydrate.hydrate(LaunchPage, props, root, JSON.parse(state))
    : BrowserHost.mount(LaunchPage, props, root)
).pipe(Layer.provide(DevTools.layer({ position: "BottomRight" })))

// Builds the Layer, which starts the app, and keeps it running.
Layer.launch(Main).pipe(Effect.runFork)
