import * as Renderer from "@effect/ui/Renderer"
import { Counter } from "./Counter.ts"
import { boot } from "./main.ts"

boot((container) => Renderer.mount(Counter, {}, container))
