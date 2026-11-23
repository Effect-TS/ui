import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { FilePreview } from "./FilePreview.ts"

const Main = BrowserHost.mount(FilePreview, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
