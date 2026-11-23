import { DevTools } from "@effect/ui-devtools"
import { Effect, Layer } from "effect"
import { type Capture, play } from "../fixtures/TwoEditors.ts"

const params = new URLSearchParams(location.search)
const position = (params.get("position") ?? "BottomRight") as DevTools.Position
const under = document.getElementById("under")!
const counts = { clicks: 0, keys: 0 }
under.addEventListener("click", () => counts.clicks++)
document.addEventListener("keydown", () => counts.keys++)
Object.assign(globalThis, { counts })

Effect.runFork(Effect.scoped(Effect.gen(function*() {
  const services = yield* Layer.build(DevTools.layer({ position }))
  yield* play("open" satisfies Capture).pipe(Effect.provide(services))
  document.body.setAttribute("data-ready", "")
  return yield* Effect.never
})))
