import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { snippets } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

// BrowserHost.mount returns a Layer that mounts LaunchPage with
// these props into #root, on the browser host. DevTools.layer adds
// the inspector in the corner of the page.
const Main = BrowserHost.mount(
  LaunchPage,
  {
    // The code this page shows, highlighted when the page is built.
    snippets,
    // The address of the page's Markdown copy, which the agent
    // prompts point to.
    articleUrl: new URL("article.md", document.baseURI).href
  },
  document.getElementById("root")!
).pipe(Layer.provide(DevTools.layer({ position: "BottomRight" })))

// Builds the Layer, which starts the app, and keeps it running.
Layer.launch(Main).pipe(Effect.runFork)
