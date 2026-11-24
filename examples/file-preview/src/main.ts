import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { FilePreview } from "./FilePreview.ts"

const Main = BrowserHost.mount(
  FilePreview,
  {},
  document.getElementById("root")!
)

Layer.launch(Main).pipe(Effect.runFork)
