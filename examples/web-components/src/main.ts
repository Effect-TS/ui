// oxlint-disable-next-line import/no-unassigned-import
import "@shoelace-style/shoelace/dist/components/qr-code/qr-code.js"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
// oxlint-disable-next-line import/no-unassigned-import
import "vanilla-colorful/hex-color-picker.js"
import { QrDesigner } from "./QrDesigner.ts"

const Main = BrowserHost.mount(QrDesigner, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
