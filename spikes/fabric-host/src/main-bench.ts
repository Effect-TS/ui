import * as Renderer from "@effect/ui/Renderer"
import * as Effect from "effect/Effect"
import { runBench } from "./bench-runner.ts"
import { Bench } from "./Bench.ts"
import { boot } from "./main.ts"

boot((container) =>
  Effect.flatMap(
    Renderer.mount(Bench, {}, container),
    (root) => Effect.promise(() => runBench((message) => root.send(message)))
  )
)
